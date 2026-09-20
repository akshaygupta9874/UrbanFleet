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
    RefundOrigin,
    RefundStatus,
} from "./payment.types.js";

/** One refund attempt (sub-document of Payment.refunds). */
export interface IRefundRecord {
    _id: Types.ObjectId;
    gatewayRefundId?: string;
    amountPaise: Paise;
    status: RefundStatus;
    origin: RefundOrigin;
    reason: string;
    initiatedBy?: Types.ObjectId;
    /** How much of this refund was taken back from the DRIVER ledger balance. */
    driverReversalPaise: Paise;
    /** How much of this refund was taken back from the PLATFORM ledger balance. */
    platformReversalPaise: Paise;
    /** Ledger transaction that booked this refund. */
    ledgerTransactionId?: string;
    /** Ledger transaction that undid the booking (only if the refund FAILED). */
    compensationLedgerTransactionId?: string;
    /** True when the driver had already been (or was being) paid out for this payment. */
    driverClawbackRequired: boolean;
    failureReason?: string;
    processedAt?: Date;
    createdAt: Date;
}

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
    /** Gateway payment id of the most recent failed attempt (makes payment.failed idempotent). */
    lastFailedGatewayPaymentId?: string;
    /** Sum of refunds that are PENDING or PROCESSED (i.e. not FAILED). */
    refundedAmountPaise: Paise;
    refunds: IRefundRecord[];
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
    /** Optional owner of the account (the driver / rider this leg belongs to). */
    ownerId?: Types.ObjectId;
    entryType: LedgerEntryType;
    amountPaise: Paise;
    currency: CurrencyType;
    referenceType: LedgerReferenceType;
    referenceId: Types.ObjectId;
    /** Logical-posting key; together with legIndex it makes double posting impossible. */
    idempotencyKey?: string;
    legIndex?: number;
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
    /** Bank reference number (UTR) returned by the gateway once processed. */
    utr?: string;
    /** Ledger transaction posted when the payout was PROCESSED. */
    ledgerTransactionId?: string;
    /** Ledger transaction posted when a PROCESSED payout was REVERSED. */
    reversalLedgerTransactionId?: string;
    processedAt?: Date;
    failedAt?: Date;
    reversedAt?: Date;
    failureReason?: string;
    metadata: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}
