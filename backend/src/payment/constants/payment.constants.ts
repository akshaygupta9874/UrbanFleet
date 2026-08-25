import { PayoutMode } from "../types/payment.types.js";

export const CURRENCY = {
    INR: "INR",
} as const;

export const RAZORPAY_WEBHOOK_EVENTS = {
    PAYMENT_AUTHORIZED: "payment.authorized",
    PAYMENT_CAPTURED: "payment.captured",
    PAYMENT_FAILED: "payment.failed",
    ORDER_PAID: "order.paid",
    REFUND_CREATED: "refund.created",
    REFUND_PROCESSED: "refund.processed",
    REFUND_FAILED: "refund.failed",
    PAYOUT_PROCESSED: "payout.processed",
    PAYOUT_REVERSED: "payout.reversed",
    PAYOUT_FAILED: "payout.failed",
} as const;

export type RazorpayWebhookEventName = (typeof RAZORPAY_WEBHOOK_EVENTS)[keyof typeof RAZORPAY_WEBHOOK_EVENTS];

export const MIN_PAYMENT_AMOUNT_PAISE = 100; 
export const MAX_PAYMENT_AMOUNT_PAISE = 5_000_000;
export const IDEMPOTENCY_LOCK_TTL_MS = 60_000;
export const REFUND_LOCK_TTL_MS = 30_000;
export const WEBHOOK_DEDUPE_TTL_SECONDS = 60 * 60 * 24 * 7;

export const REDIS_KEYS = {
    paymentOrderLock: (
        rideId: string
    ): string =>
        `lock:payment:order:${rideId}`,

    refundLock: (
        paymentId: string
    ): string =>
        `lock:payment:refund:${paymentId}`,

    webhookProcessed: (
        eventId: string
    ): string =>
        `webhook:razorpay:processed:${eventId}`,
} as const;

export const RAZORPAY_SIGNATURE_HEADER = "x-razorpay-signature";
export const RAZORPAY_EVENT_ID_HEADER = "x-razorpay-event-id";
export const DEFAULT_PAYOUT_MODE = PayoutMode.IMPS;
export const DEFAULT_PAYOUT_PURPOSE = "payout";