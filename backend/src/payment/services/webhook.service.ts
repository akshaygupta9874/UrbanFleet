import { createHmac, timingSafeEqual } from "crypto";
import { redisClient } from "../../redis/client.js";
import { AppError } from "../../utils/AppError.js";
import { paymentService } from "./payment.service.js";

import {
    RAZORPAY_WEBHOOK_EVENTS,
    REDIS_KEYS,
    WEBHOOK_DEDUPE_TTL_SECONDS,
} from "../constants/payment.constants.js";

import { RazorpayWebhookPayload } from "../types/razorpay.types.js";

class WebhookService {

    verifySignature(
        rawBody: Buffer,
        signature: string,
        secret: string
    ): boolean {

        const expected =
            createHmac(
                "sha256",
                secret
            )
                .update(rawBody)
                .digest("hex");

        const expectedBuf =
            Buffer.from(
                expected,
                "hex"
            );

        const actualBuf =
            Buffer.from(
                signature,
                "hex"
            );

        return (
            expectedBuf.length ===
                actualBuf.length &&
            timingSafeEqual(
                expectedBuf,
                actualBuf
            )
        );

    }

    private buildDedupeKey(
        eventId: string | undefined,
        payload: RazorpayWebhookPayload
    ): string {

        if (eventId) {
            return eventId;
        }

        const entityId =
            payload.payload.payment?.entity.id ??
            payload.payload.order?.entity.id ??
            payload.payload.refund?.entity.id ??
            payload.payload.payout?.entity.id ??
            "unknown";

        return `${payload.event}:${entityId}:${payload.created_at}`;

    }

    private async isDuplicate(
        dedupeKey: string
    ): Promise<boolean> {

        const result =
            await redisClient.set(
                REDIS_KEYS.webhookProcessed(
                    dedupeKey
                ),
                "1",
                {
                    NX: true,
                    EX: WEBHOOK_DEDUPE_TTL_SECONDS,
                }
            );

        return result !== "OK";

    }

    async handleEvent(
        payload: RazorpayWebhookPayload,
        eventId?: string
    ): Promise<void> {

        const dedupeKey =
            this.buildDedupeKey(
                eventId,
                payload
            );
const duplicate = await this.isDuplicate(dedupeKey);

if (duplicate) {
    console.log("Returning because duplicate webhook");
    return;
}

        switch (payload.event) {

            case RAZORPAY_WEBHOOK_EVENTS.PAYMENT_CAPTURED: {

                const entity =
                    payload.payload.payment?.entity;

                if (!entity) {

                    throw new AppError(
                        "payment.captured webhook missing payment entity",
                        400,
                        "INVALID_WEBHOOK_PAYLOAD"
                    );

                }

                await paymentService.handlePaymentCaptured(
                    entity
                );

                break;

            }

            case RAZORPAY_WEBHOOK_EVENTS.PAYMENT_FAILED: {

                const entity =
                    payload.payload.payment?.entity;

                if (!entity) {

                    throw new AppError(
                        "payment.failed webhook missing payment entity",
                        400,
                        "INVALID_WEBHOOK_PAYLOAD"
                    );

                }

                await paymentService.handlePaymentFailed(
                    entity
                );

                break;

            }

            case RAZORPAY_WEBHOOK_EVENTS.ORDER_PAID:

            case RAZORPAY_WEBHOOK_EVENTS.PAYMENT_AUTHORIZED:

            case RAZORPAY_WEBHOOK_EVENTS.REFUND_CREATED:

            case RAZORPAY_WEBHOOK_EVENTS.REFUND_PROCESSED:

            case RAZORPAY_WEBHOOK_EVENTS.REFUND_FAILED:

            case RAZORPAY_WEBHOOK_EVENTS.PAYOUT_PROCESSED:

            case RAZORPAY_WEBHOOK_EVENTS.PAYOUT_REVERSED:

            case RAZORPAY_WEBHOOK_EVENTS.PAYOUT_FAILED:

                break;

            default:

                break;

        }

    }

}

export const webhookService =
    new WebhookService();