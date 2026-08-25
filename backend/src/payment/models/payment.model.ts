import { Schema, model, Model } from "mongoose";

import {
  IPayment,
} from "../types/payment.models.js";

import {
  PaymentGateway,
  PaymentMethod,
  PaymentStatus,
} from "../types/payment.types.js";

import { CURRENCY } from "../constants/payment.constants.js";

const FareBreakdownSchema = new Schema(
  {
    baseFarePaise: {
      type: Number,
      required: true,
      min: 0,
    },

    distanceFarePaise: {
      type: Number,
      required: true,
      min: 0,
    },

    timeFarePaise: {
      type: Number,
      required: true,
      min: 0,
    },

    surgePaise: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    platformCommissionPaise: {
      type: Number,
      required: true,
      min: 0,
    },

    driverEarningPaise: {
      type: Number,
      required: true,
      min: 0,
    },

    totalPaise: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    _id: false,
  }
);

const PaymentSchema = new Schema<IPayment>(
  {
    ride: {
      type: Schema.Types.ObjectId,
      ref: "Ride",
      required: true,
      index: true,
    },

    rider: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    driver: {
      type: Schema.Types.ObjectId,
      ref: "Driver",
      required: true,
      index: true,
    },

    gateway: {
      type: String,
      enum: Object.values(PaymentGateway),
      default: PaymentGateway.RAZORPAY,
      required: true,
    },

    gatewayOrderId: {
      type: String,
      required: true,
      index: true,
    },

    gatewayPaymentId: {
      type: String,
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
      enum: Object.values(PaymentStatus),
      default: PaymentStatus.CREATED,
      required: true,
      index: true,
    },

    method: {
      type: String,
      enum: Object.values(PaymentMethod),
    },

    fareBreakdown: {
      type: FareBreakdownSchema,
      required: true,
    },

    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
    },

    attemptNumber: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },

    failureReason: {
      type: String,
      trim: true,
    },

    failureCode: {
      type: String,
      trim: true,
    },

    refundedAmountPaise: {
      type: Number,
      default: 0,
      min: 0,
      required: true,
    },

    ledgerTransactionId: {
      type: String,
    },

    metadata: {
      type: Schema.Types.Mixed,
      default: () => ({}),
    },

    capturedAt: {
      type: Date,
    },

    refundedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

PaymentSchema.index(
  {
    gatewayPaymentId: 1,
  },
  {
    unique: true,
    sparse: true,
  }
);

PaymentSchema.index({
  ride: 1,
  createdAt: -1,
});

PaymentSchema.index({
  rider: 1,
  createdAt: -1,
});

PaymentSchema.index({
  driver: 1,
  createdAt: -1,
});

PaymentSchema.index({
  status: 1,
  createdAt: -1,
});

export const PaymentModel: Model<IPayment> = model<IPayment>(
  "Payment",
  PaymentSchema
);