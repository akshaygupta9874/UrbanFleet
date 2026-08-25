import { Types } from "mongoose";

import {
    CurrencyType,
    LedgerAccount,
    LedgerEntryType,
    LedgerReferenceType,
    Paise,
    PaymentStatus,
    PayoutMode,
} from "./payment.types.js";

export interface CreateOrderInput {
    ride: Types.ObjectId;
    rider: Types.ObjectId;
    idempotencyKey: string;
}

export interface CreateOrderResult {
    paymentId: string;
    gatewayOrderId: string;
    amountPaise: Paise;
    currency: CurrencyType;
    razorpayKeyId: string;
    status: PaymentStatus;
}

export interface VerifyCheckoutInput {
    gatewayOrderId: string;
    gatewayPaymentId: string;
    signature: string;
}

export interface InitiateRefundInput {
    paymentId: Types.ObjectId;
    amountPaise?: Paise;
    reason: string;
    initiatedBy: Types.ObjectId;
}

export interface LedgerEntryInput {
    account: LedgerAccount;
    entryType: LedgerEntryType;
    amountPaise: Paise;
    description: string;
}

export interface RecordLedgerTransactionInput {
    entries: LedgerEntryInput[];
    referenceType: LedgerReferenceType;
    referenceId: Types.ObjectId;
    currency?: CurrencyType;
    metadata?: Record<string, unknown>;
}

export interface CreatePayoutInput {
    driver: Types.ObjectId;
    payment: Types.ObjectId;
    ride: Types.ObjectId;
    amountPaise: Paise;
    mode: PayoutMode;
    metadata?: Record<string, unknown>;
}