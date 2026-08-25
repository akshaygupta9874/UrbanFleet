import { Paise } from "./payment.types.js";

export interface RazorpayOrderEntity {
    id: string;
    entity: "order";
    amount: Paise;
    amount_paid: Paise;
    currency: string;
    receipt: string | null;
    status: string;
    created_at: number;
}

export interface RazorpayPaymentEntity {
    id: string;
    entity: "payment";
    order_id: string;
    status: string;
    amount: Paise;
    currency: string;
    method: string;
    captured: boolean;
    error_code?: string | null;
    error_description?: string | null;
    created_at: number;
}

export interface RazorpayRefundEntity {
    id: string;
    entity: "refund";
    payment_id: string;
    amount: Paise;
    status: string;
    speed_processed?: string;
    created_at: number;
}

export interface RazorpayPayoutEntity {
    id: string;
    entity: "payout";
    fund_account_id: string;
    amount: Paise;
    currency: string;
    status: string;
    mode: string;
    utr?: string | null;
    failure_reason?: string | null;
    created_at: number;
}

export interface RazorpayWebhookPayload {
    entity: "event";
    account_id: string;
    event: string;
    contains: string[];

    payload: {
        payment?: {
            entity: RazorpayPaymentEntity;
        };

        order?: {
            entity: RazorpayOrderEntity;
        };

        refund?: {
            entity: RazorpayRefundEntity;
        };

        payout?: {
            entity: RazorpayPayoutEntity;
        };
    };

    created_at: number;
}