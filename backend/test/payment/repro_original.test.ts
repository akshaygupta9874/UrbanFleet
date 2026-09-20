/**
 * OPTIONAL. Reproduces the defects found in the ORIGINAL payment module.
 * It imports the untouched original from src/payment_orig/ - copy your original `payment`
 * folder there to run it (paths inside the original resolve to the same ../../ modules).
 * Delete this file if you do not want it; the other suites do not depend on it.
 */
/**
 * Reproductions against the ORIGINAL (unmodified) payment module.
 * Each test demonstrates a defect found during code review.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose, { Types } from "mongoose";

// ---- fake redis (in-memory) -------------------------------------------------
const store = new Map<string, string>();
vi.mock("../src/redis/client.js", () => ({
  redisClient: {
    set: vi.fn(async (k: string, v: string, o?: { NX?: boolean }) => {
      if (o?.NX && store.has(k)) return null;
      store.set(k, v);
      return "OK";
    }),
    del: vi.fn(async (k: string) => (store.delete(k) ? 1 : 0)),
    eval: vi.fn(async () => 1),
  },
}));

import { paymentService } from "../../src/payment/services/payment.service.js";
import { webhookService } from "../../src/payment/services/webhook.service.js";
import { ledgerService } from "../../src/payment/services/ledger.service.js";
import { ledgerRepository } from "../../src/payment/repositories/ledger.repository.js";
import { paymentRepository } from "../../src/payment/repositories/payment.repository.js";
import { RideModel } from "../../src/models/ride.model.js";
import {
  PaymentStatus,
  LedgerAccount,
  LedgerEntryType,
  LedgerReferenceType,
} from "../../src/payment/types/payment.types.js";

beforeEach(() => {
  store.clear();
  vi.restoreAllMocks();
});

const fakeSession = () => ({
  withTransaction: async (fn: () => Promise<void>) => fn(),
  endSession: async () => {},
});

const basePayment = (over: Record<string, unknown> = {}) => ({
  _id: new Types.ObjectId(),
  ride: new Types.ObjectId(),
  status: PaymentStatus.PENDING,
  amountPaise: 1000,
  fareBreakdown: { platformCommissionPaise: 300, driverEarningPaise: 700 },
  ...over,
});

describe("ORIGINAL: webhook dedupe", () => {
  it("BUG: an event that failed once is silently dropped on Razorpay's retry", async () => {
    const spy = vi
      .spyOn(paymentService, "handlePaymentCaptured")
      .mockRejectedValueOnce(new Error("transient DB error"))
      .mockResolvedValue(undefined);

    const payload: any = {
      event: "payment.captured",
      created_at: 1,
      payload: { payment: { entity: { id: "pay_1", order_id: "order_1" } } },
    };

    await expect(webhookService.handleEvent(payload, "evt_1")).rejects.toThrow(
      "transient DB error"
    );
    // Razorpay retries the SAME event id after a non-2xx response:
    await webhookService.handleEvent(payload, "evt_1");

    // The retry never reached the handler => the capture is lost forever.
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("ORIGINAL: capture handler ordering", () => {
  it("BUG: ledger rows are written BEFORE the status compare-and-swap, and a lost CAS is ignored", async () => {
    const payment = basePayment();
    vi.spyOn(mongoose, "startSession").mockResolvedValue(fakeSession() as any);
    vi.spyOn(paymentRepository, "findByGatewayOrderId").mockResolvedValue(payment as any);
    // another request already won the race -> CAS returns null
    vi.spyOn(paymentRepository, "transitionStatus").mockResolvedValue(null);
    const rec = vi.spyOn(ledgerService, "recordTransaction").mockResolvedValue("tx-1");
    vi.spyOn(RideModel, "findByIdAndUpdate").mockResolvedValue(null as any);

    await paymentService.handlePaymentCaptured({
      id: "pay_1",
      entity: "payment",
      order_id: "order_1",
      status: "captured",
      amount: 1000,
      currency: "INR",
      method: "upi",
      captured: true,
      created_at: 1,
    });

    // resolves without error, yet 3 ledger rows were already inserted in a
    // transaction that then COMMITS -> duplicate posting.
    expect(rec).toHaveBeenCalledTimes(1);
  });

  it("BUG: a payment marked FAILED (first attempt) rejects the later successful capture", async () => {
    vi.spyOn(paymentRepository, "findByGatewayOrderId").mockResolvedValue(
      basePayment({ status: PaymentStatus.FAILED }) as any
    );
    await expect(
      paymentService.handlePaymentCaptured({
        id: "pay_2",
        entity: "payment",
        order_id: "order_1",
        status: "captured",
        amount: 1000,
        currency: "INR",
        method: "card",
        captured: true,
        created_at: 1,
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("BUG: a fare with 0 commission (or 0 driver earning) makes the capture throw", async () => {
    const payment = basePayment({
      fareBreakdown: { platformCommissionPaise: 0, driverEarningPaise: 1000 },
    });
    vi.spyOn(mongoose, "startSession").mockResolvedValue(fakeSession() as any);
    vi.spyOn(paymentRepository, "findByGatewayOrderId").mockResolvedValue(payment as any);
    vi.spyOn(ledgerRepository, "insertEntries").mockResolvedValue([]);

    await expect(
      paymentService.handlePaymentCaptured({
        id: "pay_3",
        entity: "payment",
        order_id: "order_1",
        status: "captured",
        amount: 1000,
        currency: "INR",
        method: "upi",
        captured: true,
        created_at: 1,
      })
    ).rejects.toThrow(/positive integer paise/);
  });
});

describe("ORIGINAL: partial-refund ledger reversal", () => {
  it("BUG: per-leg reversals drift away from the fare split across several partial refunds", async () => {
    // Search a small space for a sequence of partial refunds whose *total* is the
    // full payment but whose per-account reversal does not equal the original legs.
    const inserted: any[][] = [];
    vi.spyOn(ledgerRepository, "insertEntries").mockImplementation(async (rows: any) => {
      inserted.push(rows);
      return rows;
    });

    let counterExample: null | Record<string, unknown> = null;

    outer: for (const total of [101, 250, 999, 1000, 1234]) {
      for (const driver of [1, 3, 7, 33, Math.floor(total * 0.8)]) {
        const platform = total - driver;
        if (platform <= 0) continue;
        vi.spyOn(ledgerRepository, "findByTransactionId").mockResolvedValue([
          { account: LedgerAccount.RIDER, entryType: LedgerEntryType.DEBIT, amountPaise: total, description: "r" },
          { account: LedgerAccount.PLATFORM, entryType: LedgerEntryType.CREDIT, amountPaise: platform, description: "p" },
          { account: LedgerAccount.DRIVER, entryType: LedgerEntryType.CREDIT, amountPaise: driver, description: "d" },
        ] as any);

        // three refunds that add up to the whole payment
        const parts = [Math.floor(total / 3), Math.floor(total / 3)];
        parts.push(total - parts[0]! - parts[1]!);

        inserted.length = 0;
        for (const p of parts) {
          await ledgerService.reverseTransactionPartial(
            "orig-tx",
            p / total,
            LedgerReferenceType.REFUND,
            new Types.ObjectId(),
            "test",
            fakeSession() as any
          );
        }
        const reversedDriver = inserted
          .flat()
          .filter((r) => r.account === LedgerAccount.DRIVER)
          .reduce((s, r) => s + r.amountPaise, 0);
        const reversedPlatform = inserted
          .flat()
          .filter((r) => r.account === LedgerAccount.PLATFORM)
          .reduce((s, r) => s + r.amountPaise, 0);

        if (reversedDriver !== driver || reversedPlatform !== platform) {
          counterExample = { total, driver, platform, parts, reversedDriver, reversedPlatform };
          break outer;
        }
      }
    }
    console.log("refund drift counter-example:", JSON.stringify(counterExample));
    expect(counterExample).not.toBeNull();
  });
});
