import { Document, Types } from "mongoose";

import type {
    CurrencyType,
    IFareBreakdown,
    LedgerAccount,
    LedgerEntryType,
    LedgerReferenceType,
    Paise,
    PaymentGateway,
    PaymentMethod,
    PaymentStatus,
    PayoutMode,
    PayoutStatus,
} from "./payment.types.js";

export interface IPayment extends Document {
    _id: Types.ObjectId;
    ride: Types.ObjectId;
    rider: Types.ObjectId;
    driver: Types.ObjectId;
    gateway: PaymentGateway;
    gatewayOrderId: string;
    gatewayPaymentId?: string;
    amountPaise: Paise;
    currency: CurrencyType;
    status: PaymentStatus;
    method?: PaymentMethod;
    fareBreakdown: IFareBreakdown;
    idempotencyKey: string;
    attemptNumber: number;
    failureReason?: string;
    failureCode?: string;
    refundedAmountPaise: Paise;
    ledgerTransactionId?: string;
    metadata: Record<string, unknown>;
    capturedAt?: Date;
    refundedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface ILedgerEntry extends Document {
    _id: Types.ObjectId;
    transactionId: string;
    account: LedgerAccount;
    entryType: LedgerEntryType;
    amountPaise: Paise;
    currency: CurrencyType;
    referenceType: LedgerReferenceType;
    referenceId: Types.ObjectId;
    description: string;
    metadata: Record<string, unknown>;
    createdAt: Date;
}

export interface IPayout extends Document {
    _id: Types.ObjectId;
    payment: Types.ObjectId;
    ride: Types.ObjectId;
    driver: Types.ObjectId;
    amountPaise: Paise;
    currency: CurrencyType;
    status: PayoutStatus;
    mode: PayoutMode;
    gatewayPayoutId?: string;
    processedAt?: Date;
    failureReason?: string;
    metadata: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}