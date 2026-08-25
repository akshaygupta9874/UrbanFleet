import { Schema, model, Model } from "mongoose";

import { IPayout } from "../types/payment.models.js";

import {
    PayoutMode,
    PayoutStatus,
} from "../types/payment.types.js";

import {
    CURRENCY,
    DEFAULT_PAYOUT_MODE,
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
            index: true,
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

        gatewayPayoutId: {
            type: String,
            index: true,
        },

        processedAt: {
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

PayoutSchema.index({
    payment: 1,
});

PayoutSchema.index({
    ride: 1,
});

export const PayoutModel: Model<IPayout> = model<IPayout>(
    "Payout",
    PayoutSchema
);