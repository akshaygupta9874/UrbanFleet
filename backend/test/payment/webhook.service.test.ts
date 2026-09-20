import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";

const redis = vi.hoisted(() => {
  const state = { store: new Map<string, string>(), down: false };
  const guard = () => { if (state.down) throw new Error("redis down"); };
  return {
    state,
    client: {
      set: async (k: string, v: string, o?: { NX?: boolean }) => {
        guard();
        if (o?.NX && state.store.has(k)) return null;
        state.store.set(k, v);
        return "OK";
      },
      del: async (k: string) => { guard(); return state.store.delete(k) ? 1 : 0; },
      eval: async () => 1,
    },
  };
});
vi.mock("../src/redis/client.js", () => ({ redisClient: redis.client }));

import { webhookService } from "../../src/payment/services/webhook.service.js";
import { paymentService } from "../../src/payment/services/payment.service.js";
import { refundService } from "../../src/payment/services/refund.service.js";
import { payoutService } from "../../src/payment/services/payout.service.js";
import { handleRazorpayWebhook } from "../../src/payment/controllers/webhook.controller.js";
import { NonRetryablePaymentError } from "../../src/payment/errors/payment.errors.js";

beforeEach(() => {
  redis.state.store.clear();
  redis.state.down = false;
});

const event = (name: string, payload: Record<string, unknown>, id = "evt_1"): any => ({
  entity: "event", account_id: "acc", event: name, contains: [], created_at: 1700000000,
  payload,
  __id: id,
});
const pay = { payment: { entity: { id: "pay_1", order_id: "order_1" } } };

describe("verifySignature", () => {
  const body = Buffer.from('{"event":"payment.captured"}');
  const good = createHmac("sha256", "s3cret").update(body).digest("hex");

  it("accepts only the exact HMAC-SHA256 of the raw body", () => {
    expect(webhookService.verifySignature(body, good, "s3cret")).toBe(true);
    expect(webhookService.verifySignature(body, good, "other")).toBe(false);
    expect(webhookService.verifySignature(Buffer.from('{"event":"x"}'), good, "s3cret")).toBe(false);
    expect(webhookService.verifySignature(body, "zz", "s3cret")).toBe(false);
    expect(webhookService.verifySignature(body, good.slice(2), "s3cret")).toBe(false);
  });
});

describe("dedupe protocol", () => {
  it("FIXED: an event whose handler failed IS processed when Razorpay retries it (before: lost forever)", async () => {
    const handler = vi.spyOn(paymentService, "handlePaymentCaptured")
      .mockRejectedValueOnce(new Error("transient DB error"))
      .mockResolvedValue(undefined);
    const payload = event("payment.captured", pay);

    await expect(webhookService.handleEvent(payload, "evt_1")).rejects.toThrow("transient DB error");
    expect(redis.state.store.size).toBe(0); // marker released

    expect(await webhookService.handleEvent(payload, "evt_1")).toBe("processed"); // the retry
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("a successfully processed event is skipped when delivered again", async () => {
    const handler = vi.spyOn(paymentService, "handlePaymentCaptured").mockResolvedValue(undefined);
    const payload = event("payment.captured", pay);
    expect(await webhookService.handleEvent(payload, "evt_2")).toBe("processed");
    expect(await webhookService.handleEvent(payload, "evt_2")).toBe("duplicate");
    expect(handler).toHaveBeenCalledTimes(1);
    expect(redis.state.store.get("webhook:razorpay:processed:evt_2")).toBe("done");
  });

  it("a delivery that arrives while the first is still running is skipped", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const handler = vi.spyOn(paymentService, "handlePaymentCaptured").mockImplementation(() => gate);
    const payload = event("payment.captured", pay);

    const first = webhookService.handleEvent(payload, "evt_3");
    await Promise.resolve(); await Promise.resolve();
    expect(await webhookService.handleEvent(payload, "evt_3")).toBe("duplicate");
    release();
    expect(await first).toBe("processed");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("NON-retryable errors are acknowledged (200) and not reprocessed", async () => {
    const handler = vi.spyOn(paymentService, "handlePaymentCaptured")
      .mockRejectedValue(new NonRetryablePaymentError("Payment not found.", 404, "PAYMENT_NOT_FOUND"));
    const payload = event("payment.captured", pay);
    expect(await webhookService.handleEvent(payload, "evt_4")).toBe("acknowledged_with_error");
    expect(await webhookService.handleEvent(payload, "evt_4")).toBe("duplicate");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("fails OPEN when Redis is unavailable (handlers are idempotent anyway)", async () => {
    redis.state.down = true;
    const handler = vi.spyOn(paymentService, "handlePaymentCaptured").mockResolvedValue(undefined);
    expect(await webhookService.handleEvent(event("payment.captured", pay), "evt_5")).toBe("processed");
    expect(handler).toHaveBeenCalledTimes(1);

    // and a failing handler still surfaces its error even though release() cannot reach Redis
    handler.mockRejectedValueOnce(new Error("boom"));
    await expect(webhookService.handleEvent(event("payment.captured", pay), "evt_6")).rejects.toThrow("boom");
  });

  it("derives a key from the payload when the event-id header is missing", async () => {
    vi.spyOn(paymentService, "handlePaymentCaptured").mockResolvedValue(undefined);
    await webhookService.handleEvent(event("payment.captured", pay));
    expect([...redis.state.store.keys()]).toEqual(["webhook:razorpay:processed:payment.captured:pay_1:1700000000"]);
  });
});

describe("routing", () => {
  it("payment events", async () => {
    const authorized = vi.spyOn(paymentService, "handlePaymentAuthorized").mockResolvedValue();
    const captured = vi.spyOn(paymentService, "handlePaymentCaptured").mockResolvedValue();
    const failed = vi.spyOn(paymentService, "handlePaymentFailed").mockResolvedValue();

    await webhookService.handleEvent(event("payment.authorized", pay), "a");
    await webhookService.handleEvent(event("payment.captured", pay), "b");
    await webhookService.handleEvent(event("order.paid", { ...pay, order: { entity: { id: "order_1" } } }), "c"); // 2nd, independent capture signal
    await webhookService.handleEvent(event("payment.failed", pay), "d");

    expect(authorized).toHaveBeenCalledTimes(1);
    expect(captured).toHaveBeenCalledTimes(2);
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it("refund events map to created / processed / failed", async () => {
    const spy = vi.spyOn(refundService, "handleGatewayRefundEvent").mockResolvedValue();
    const refund = { refund: { entity: { id: "rfnd_1", payment_id: "pay_1", amount: 5 } } };
    await webhookService.handleEvent(event("refund.created", refund), "r1");
    await webhookService.handleEvent(event("refund.processed", refund), "r2");
    await webhookService.handleEvent(event("refund.failed", refund), "r3");
    expect(spy.mock.calls.map((c) => c[0])).toEqual(["created", "processed", "failed"]);
  });

  it("payout events go to the payout service", async () => {
    const spy = vi.spyOn(payoutService, "handleGatewayPayoutEvent").mockResolvedValue();
    const payout = { payout: { entity: { id: "pout_1" } } };
    for (const [i, name] of ["payout.initiated", "payout.processed", "payout.failed", "payout.rejected", "payout.reversed"].entries()) {
      await webhookService.handleEvent(event(name, payout), `p${i}`);
    }
    expect(spy.mock.calls.map((c) => c[0])).toEqual(["payout.initiated", "payout.processed", "payout.failed", "payout.rejected", "payout.reversed"]);
  });

  it("unknown events are ignored; a missing entity is a non-retryable, acknowledged error", async () => {
    expect(await webhookService.handleEvent(event("subscription.charged", {}), "u1")).toBe("ignored");
    expect(await webhookService.handleEvent(event("payment.captured", {}), "u2")).toBe("acknowledged_with_error");
    expect(await webhookService.handleEvent(event("refund.processed", {}), "u3")).toBe("acknowledged_with_error");
    expect(await webhookService.handleEvent(event("payout.processed", {}), "u4")).toBe("acknowledged_with_error");
  });
});

describe("webhook controller", () => {
  const run = async (req: any) => {
    const res: any = { statusCode: 0, body: undefined, status(c: number) { this.statusCode = c; return this; }, json(b: unknown) { this.body = b; return this; } };
    const next = vi.fn();
    await (handleRazorpayWebhook as any)(req, res, next);
    await new Promise((r) => setImmediate(r));
    return { res, next };
  };
  const bodyOf = (o: object) => Buffer.from(JSON.stringify(o));
  const sign = (b: Buffer, secret = "test_webhook_secret") => createHmac("sha256", secret).update(b).digest("hex");

  it("valid signature -> 200 and the event (with its id) is handled", async () => {
    const handle = vi.spyOn(webhookService, "handleEvent").mockResolvedValue("processed");
    const body = bodyOf(event("payment.captured", pay));
    const { res, next } = await run({ body, headers: { "x-razorpay-signature": sign(body), "x-razorpay-event-id": "evt_9" } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
    expect(handle).toHaveBeenCalledWith(expect.objectContaining({ event: "payment.captured" }), "evt_9");
    expect(next).not.toHaveBeenCalled();
  });

  it.each([
    ["bad signature", (b: Buffer) => ({ body: b, headers: { "x-razorpay-signature": sign(b, "wrong") } }), 400],
    ["missing signature", (b: Buffer) => ({ body: b, headers: {} }), 400],
    ["body already parsed (raw parser missing)", () => ({ body: { event: "x" }, headers: { "x-razorpay-signature": "ab" } }), 400],
  ])("%s -> rejected before any handler runs", async (_n, make, status) => {
    const handle = vi.spyOn(webhookService, "handleEvent");
    const { next } = await run(make(bodyOf(event("payment.captured", pay))));
    expect(next.mock.calls[0]![0]).toMatchObject({ statusCode: status });
    expect(handle).not.toHaveBeenCalled();
  });

  it("valid signature but invalid JSON -> 400; missing secret -> 500", async () => {
    const junk = Buffer.from("not json");
    let r = await run({ body: junk, headers: { "x-razorpay-signature": sign(junk) } });
    expect(r.next.mock.calls[0]![0]).toMatchObject({ statusCode: 400 });

    const saved = process.env.RAZORPAY_WEBHOOK_SECRET;
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    r = await run({ body: junk, headers: { "x-razorpay-signature": "ab" } });
    process.env.RAZORPAY_WEBHOOK_SECRET = saved;
    expect(r.next.mock.calls[0]![0]).toMatchObject({ statusCode: 500 });
  });

  it("a retryable handler error reaches the error middleware (=> non-2xx => Razorpay retries)", async () => {
    vi.spyOn(webhookService, "handleEvent").mockRejectedValue(new Error("db down"));
    const body = bodyOf(event("payment.captured", pay));
    const { res, next } = await run({ body, headers: { "x-razorpay-signature": sign(body) } });
    expect(res.statusCode).toBe(0);
    expect(next.mock.calls[0]![0]).toBeInstanceOf(Error);
  });
});
