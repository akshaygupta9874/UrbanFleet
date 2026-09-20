/**
 * Model-level checks that need no database: schema validation, index definitions,
 * append-only ledger hooks and - importantly - that the update / filter documents built by the
 * repositories CAST to the paths we intend (Mongoose silently drops unknown paths in strict mode).
 */
import { describe, it, expect } from "vitest";
import { Types } from "mongoose";
import { PaymentModel } from "../../src/payment/models/payment.model.js";
import { LedgerEntryModel } from "../../src/payment/models/ledger.model.js";
import { PayoutModel } from "../../src/payment/models/payout.model.js";
import { paymentRepository } from "../../src/payment/repositories/payment.repository.js";
import {
  LedgerAccount, LedgerEntryType, LedgerReferenceType, PaymentStatus, RefundOrigin, RefundStatus, PayoutStatus,
} from "../../src/payment/types/payment.types.js";

const oid = () => new Types.ObjectId();
const fare = { baseFarePaise: 400, distanceFarePaise: 300, timeFarePaise: 200, surgePaise: 100, platformCommissionPaise: 300, driverEarningPaise: 700, totalPaise: 1000 };
const basePayment = () => ({
  ride: oid(), rider: oid(), driver: oid(), gateway: "RAZORPAY", gatewayOrderId: "order_1", amountPaise: 1000,
  currency: "INR", status: PaymentStatus.CREATED, fareBreakdown: fare, idempotencyKey: "k".repeat(64), attemptNumber: 1,
});

const indexes = (model: { schema: { indexes(): [Record<string, unknown>, Record<string, unknown>][] } }) =>
  model.schema.indexes().map(([keys, opts]) => ({ keys, opts }));

describe("Payment model", () => {
  it("accepts a normal document and defaults refunds to []", () => {
    const doc = new PaymentModel(basePayment());
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.refunds).toHaveLength(0);
    expect(doc.refundedAmountPaise).toBe(0);
  });

  it("validates refund sub-documents", () => {
    const good = { amountPaise: 100, reason: "r", status: RefundStatus.PENDING, origin: RefundOrigin.APP, driverReversalPaise: 70, platformReversalPaise: 30 };
    expect(new PaymentModel({ ...basePayment(), refunds: [good] }).validateSync()).toBeUndefined();
    for (const bad of [{ amountPaise: 0 }, { amountPaise: 1.5 }, { reason: undefined }, { status: "NOPE" }, { driverReversalPaise: -1 }]) {
      expect(new PaymentModel({ ...basePayment(), refunds: [{ ...good, ...bad }] }).validateSync()).toBeDefined();
    }
  });

  it("declares the refund lookup index as NON-unique and keeps the unique keys", () => {
    const idx = indexes(PaymentModel as any);
    const refundIdx = idx.find((i) => "refunds.gatewayRefundId" in i.keys)!;
    expect(refundIdx).toBeDefined();
    expect(refundIdx.opts.unique).toBeUndefined();
    expect(idx.some((i) => "idempotencyKey" in i.keys && i.opts.unique)).toBe(true);
  });

  it("repository update documents cast to real schema paths (nothing silently dropped)", () => {
    const refundId = oid();
    const record = {
      _id: refundId, amountPaise: 250, status: RefundStatus.PENDING, origin: RefundOrigin.APP, reason: "why",
      driverReversalPaise: 175, platformReversalPaise: 75, ledgerTransactionId: "tx", driverClawbackRequired: true, createdAt: new Date(),
    };

    // bookRefund: $set + $push of a whole record
    const book = PaymentModel.findOneAndUpdate(
      { _id: oid(), status: PaymentStatus.CAPTURED, refundedAmountPaise: 0 },
      { $set: { status: PaymentStatus.PARTIALLY_REFUNDED, refundedAmountPaise: 250, refundedAt: new Date() }, $push: { refunds: record as any } },
      { returnDocument: "after" }
    );
    const casted: any = (book as any)._castUpdate(book.getUpdate());
    expect(casted.$push.refunds).toMatchObject({ amountPaise: 250, driverReversalPaise: 175, platformReversalPaise: 75, driverClawbackRequired: true, ledgerTransactionId: "tx", status: "PENDING", origin: "APP" });
    expect(casted.$push.refunds._id.toString()).toBe(refundId.toString());
    expect(casted.$set.refundedAmountPaise).toBe(250);

    // updateRefundRecord / failRefund: positional paths must survive casting
    const fail = PaymentModel.findOneAndUpdate(
      { _id: oid(), refundedAmountPaise: 250, refunds: { $elemMatch: { _id: refundId, status: { $in: [RefundStatus.PENDING, RefundStatus.PROCESSED] } } } },
      { $set: {
          status: PaymentStatus.CAPTURED, refundedAmountPaise: 0,
          "refunds.$.status": RefundStatus.FAILED, "refunds.$.failureReason": "x",
          "refunds.$.compensationLedgerTransactionId": "tx-undo", "refunds.$.gatewayRefundId": "rfnd_1",
          "refunds.$.processedAt": new Date(), "refunds.$.driverClawbackRequired": true,
      } }
    );
    const castedFail: any = (fail as any)._castUpdate(fail.getUpdate());
    expect(Object.keys(castedFail.$set).sort()).toEqual([
      "refundedAmountPaise", "refunds.$.compensationLedgerTransactionId", "refunds.$.driverClawbackRequired",
      "refunds.$.failureReason", "refunds.$.gatewayRefundId", "refunds.$.processedAt", "refunds.$.status", "status",
    ]);
    fail.cast(PaymentModel);
    expect((fail as any)._conditions.refunds.$elemMatch._id).toBeInstanceOf(Types.ObjectId);

    // recordFailedAttempt: $set + $inc
    const failed = PaymentModel.findOneAndUpdate({ _id: oid() }, { $set: { status: PaymentStatus.FAILED, lastFailedGatewayPaymentId: "pay_1", failureReason: "r", failureCode: "c" }, $inc: { attemptNumber: 1 } });
    const castedFailed: any = (failed as any)._castUpdate(failed.getUpdate());
    expect(Object.keys(castedFailed.$set).sort()).toEqual(["failureCode", "failureReason", "lastFailedGatewayPaymentId", "status"]);
    expect(castedFailed.$inc).toEqual({ attemptNumber: 1 });
  });

  it("repository query builders produce ObjectId filters", () => {
    const q: any = (paymentRepository as any).buildQuery({ rider: oid().toString(), status: PaymentStatus.CAPTURED });
    expect(q.rider).toBeInstanceOf(Types.ObjectId);
    expect(q.status).toBe(PaymentStatus.CAPTURED);
  });
});

describe("Ledger model", () => {
  const entry = () => ({
    transactionId: "t", account: LedgerAccount.DRIVER, ownerId: oid(), entryType: LedgerEntryType.CREDIT, amountPaise: 700, currency: "INR",
    referenceType: LedgerReferenceType.PAYMENT, referenceId: oid(), idempotencyKey: "payment:1:capture", legIndex: 2, description: "d",
  });

  it("stores owner / idempotency fields; BANK is a valid account; bad amounts are rejected", () => {
    expect(new LedgerEntryModel(entry()).validateSync()).toBeUndefined();
    expect(new LedgerEntryModel({ ...entry(), account: LedgerAccount.BANK }).validateSync()).toBeUndefined();
    expect(new LedgerEntryModel({ ...entry(), amountPaise: 0 }).validateSync()).toBeDefined();
    expect(new LedgerEntryModel({ ...entry(), amountPaise: 1.5 }).validateSync()).toBeDefined();
    expect(new LedgerEntryModel({ ...entry(), account: "NOPE" }).validateSync()).toBeDefined();
  });

  it("has a UNIQUE PARTIAL index on (idempotencyKey, legIndex) and a per-owner balance index", () => {
    const idx = indexes(LedgerEntryModel as any);
    const unique = idx.find((i) => "idempotencyKey" in i.keys)!;
    expect(unique.keys).toEqual({ idempotencyKey: 1, legIndex: 1 });
    expect(unique.opts.unique).toBe(true);
    expect(unique.opts.partialFilterExpression).toEqual({ idempotencyKey: { $type: "string" } });
    expect(idx.some((i) => JSON.stringify(i.keys) === JSON.stringify({ account: 1, ownerId: 1, createdAt: 1 }))).toBe(true);
  });

  it("is append-only: every update / replace / delete path is rejected before reaching the database", async () => {
    const id = oid();
    const attempts: [string, () => Promise<unknown>][] = [
      ["updateOne", () => LedgerEntryModel.updateOne({ _id: id }, { $set: { amountPaise: 1 } }).exec()],
      ["updateMany", () => LedgerEntryModel.updateMany({}, { $set: { amountPaise: 1 } }).exec()],
      ["findOneAndUpdate", () => LedgerEntryModel.findOneAndUpdate({ _id: id }, { $set: { amountPaise: 1 } }).exec()],
      ["replaceOne", () => LedgerEntryModel.replaceOne({ _id: id }, entry()).exec()],
      ["findOneAndReplace", () => LedgerEntryModel.findOneAndReplace({ _id: id }, entry()).exec()],
      ["deleteOne", () => LedgerEntryModel.deleteOne({ _id: id }).exec()],
      ["deleteMany", () => LedgerEntryModel.deleteMany({}).exec()],
      ["findOneAndDelete", () => LedgerEntryModel.findOneAndDelete({ _id: id }).exec()],
      ["doc.save() on an existing entry", () => LedgerEntryModel.hydrate({ _id: id, ...entry() }).save()],
      ["doc.deleteOne()", () => LedgerEntryModel.hydrate({ _id: id, ...entry() }).deleteOne()],
    ];
    for (const [name, run] of attempts) {
      await expect(run(), name).rejects.toThrow(/append-only/);
    }
  });
});

describe("Payout model", () => {
  const payout = (over = {}) => ({ driver: oid(), payment: oid(), ride: oid(), amountPaise: 700, status: PayoutStatus.PENDING, mode: "IMPS", ...over });

  it("accepts the new fields", () => {
    const doc = new PayoutModel(payout({ utr: "UTR1", ledgerTransactionId: "t", reversalLedgerTransactionId: "u", failedAt: new Date(), reversedAt: new Date() }));
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.utr).toBe("UTR1");
    expect(new PayoutModel(payout({ status: PayoutStatus.REVERSED })).validateSync()).toBeUndefined();
  });

  it("FIXED: one live payout per payment via a partial unique index; no conflicting duplicate index definitions", () => {
    const idx = indexes(PayoutModel as any);
    const live = idx.find((i) => i.opts.name === "payment_1_live_unique")!;
    expect(live.opts.unique).toBe(true);
    expect(live.opts.partialFilterExpression).toEqual({ status: { $in: ["PENDING", "PROCESSING", "PROCESSED"] } });

    // no second definition with the very same key pattern {payment: 1}
    expect(idx.filter((i) => JSON.stringify(i.keys) === JSON.stringify({ payment: 1 }))).toHaveLength(1);
    // gatewayPayoutId is declared exactly once, and as unique+sparse
    const gw = idx.filter((i) => "gatewayPayoutId" in i.keys);
    expect(gw).toHaveLength(1);
    expect(gw[0]!.opts).toMatchObject({ unique: true, sparse: true });
    // {ride: 1} declared once
    expect(idx.filter((i) => JSON.stringify(i.keys) === JSON.stringify({ ride: 1 }))).toHaveLength(1);
  });
});
