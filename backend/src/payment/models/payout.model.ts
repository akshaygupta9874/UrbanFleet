import { Schema, model, Model } from "mongoose";

import { IPayout } from "../types/payment.models.js";

import {
    PayoutMode,
    PayoutStatus,
} from "../types/payment.types.js";

import {
    CURRENCY,
    DEFAULT_PAYOUT_MODE,
    LIVE_PAYOUT_STATUSES,
} from "../constants/payment.constants.js";

const PayoutSchema = new Schema<IPayout>(
    {
        driver: {
            type: Schema.Types.ObjectId,
            ref: "Driver",
            required: true,
            index: true,
        },

        payment: {
            type: Schema.Types.ObjectId,
            ref: "Payment",
            required: true,
        },
        ride: {
            type: Schema.Types.ObjectId,
            ref: "Ride",
            required: true,
            index: true,
        },

        amountPaise: {
            type: Number,
            required: true,
            min: 0,
        },

        currency: {
            type: String,
            required: true,
            default: CURRENCY.INR,
        },

        status: {
            type: String,
            enum: Object.values(PayoutStatus),
            required: true,
            default: PayoutStatus.PENDING,
            index: true,
        },

        mode: {
            type: String,
            enum: Object.values(PayoutMode),
            required: true,
            default: DEFAULT_PAYOUT_MODE,
        },

        // uniqueness comes from the sparse unique index declared below
        gatewayPayoutId: {
            type: String,
        },

        utr: {
            type: String,
            trim: true,
        },

        ledgerTransactionId: {
            type: String,
        },

        reversalLedgerTransactionId: {
            type: String,
        },

        processedAt: {
            type: Date,
        },

        failedAt: {
            type: Date,
        },

        reversedAt: {
            type: Date,
        },

        failureReason: {
            type: String,
            trim: true,
        },

        metadata: {
            type: Schema.Types.Mixed,
            default: () => ({}),
        },
    },
    {
        timestamps: true,
    }
);

PayoutSchema.index(
    {
        gatewayPayoutId: 1,
    },
    {
        unique: true,
        sparse: true,
    }
);

PayoutSchema.index({
    driver: 1,
    status: 1,
    createdAt: -1,
});

// General "all payouts of this payment" lookups. (Deliberately not {payment: 1} alone: that key
// belongs to the partial unique index below.)
PayoutSchema.index({
    payment: 1,
    createdAt: -1,
});

// At most ONE live payout (PENDING / PROCESSING / PROCESSED) per payment, enforced by
// the database. A FAILED / CANCELLED / REVERSED payout can be replaced by a new one.
// (partialFilterExpression with $in needs MongoDB >= 6.0.)
PayoutSchema.index(
    {
        payment: 1,
    },
    {
        unique: true,
        partialFilterExpression: {
            status: { $in: [...LIVE_PAYOUT_STATUSES] },
        },
        name: "payment_1_live_unique",
    }
);

export const PayoutModel: Model<IPayout> = model<IPayout>(
    "Payout",
    PayoutSchema
);
