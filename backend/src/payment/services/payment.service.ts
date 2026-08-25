import { randomUUID, createHmac, timingSafeEqual } from "crypto";
import mongoose from "mongoose";

import {
  RazorpayPaymentEntity,
} from "../types/razorpay.types.js";

import {
  InitiateRefundInput,
} from "../types/payment.dto.js";

import {
  LedgerAccount,
  LedgerEntryType,
  LedgerReferenceType
} from "../types/payment.types.js";

import {
  REFUND_LOCK_TTL_MS,
} from "../constants/payment.constants.js";

import { razorpayClient } from "../../config/razorpay.config.js";
import { redisClient } from "../../redis/client.js";

import { AppError } from "../../utils/AppError.js";

import { paymentRepository } from "../repositories/payment.repository.js";
import { ledgerService } from "./ledger.service.js";

import {
  CreateOrderInput,
  CreateOrderResult,
  VerifyCheckoutInput,
} from "../types/payment.dto.js";

import {
  IFareBreakdown,
  PaymentGateway,
  PaymentMethod,
  PaymentStatus,
} from "../types/payment.types.js";

import {
  CURRENCY,
  IDEMPOTENCY_LOCK_TTL_MS,
  MAX_PAYMENT_AMOUNT_PAISE,
  MIN_PAYMENT_AMOUNT_PAISE,
  REDIS_KEYS,
} from "../constants/payment.constants.js";

import { RideModel, RidePaymentStatus, RideStatus } from "../../models/ride.model.js";
import { emitPaymentCaptured } from "../../sockets/emitters/driver.emitter.js";

const RAZORPAY_METHOD_MAP: Record<
  string,
  PaymentMethod
> = {
  upi: PaymentMethod.UPI,

  card: PaymentMethod.CARD,

  netbanking: PaymentMethod.NETBANKING,

  wallet: PaymentMethod.WALLET,

  emi: PaymentMethod.EMI,
};

type ReleaseLock = () => Promise<void>;

export async function acquireLock(
  key: string,
  ttlMs: number
): Promise<ReleaseLock | null> {
  const token = randomUUID();

  const result = await redisClient.set(
    key,
    token,
    {
      NX: true,
      PX: ttlMs,
    }
  );

  if (result !== "OK") {
    return null;
  }

  return async (): Promise<void> => {
    const releaseScript = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      end
      return 0
    `;

    await redisClient.eval(releaseScript, {
      keys: [key],
      arguments: [token],
    });
  };
}

function validateFareBreakdown(
  fare: IFareBreakdown
): void {

  const fareTotal =
    fare.baseFarePaise +
    fare.distanceFarePaise +
    fare.timeFarePaise +
    fare.surgePaise;

  const earningTotal =
    fare.driverEarningPaise +
    fare.platformCommissionPaise;

  if (
    fareTotal !==
    fare.totalPaise
  ) {
    throw new AppError(
      `Fare components (${fareTotal}) do not equal total (${fare.totalPaise})`,
      422,
      "FARE_BREAKDOWN_INVALID"
    );
  }

  if (
    earningTotal !==
    fare.totalPaise
  ) {
    throw new AppError(
      `Driver + Platform split (${earningTotal}) does not equal total (${fare.totalPaise})`,
      422,
      "FARE_BREAKDOWN_INVALID"
    );

  }

  if (
    fare.totalPaise <
    MIN_PAYMENT_AMOUNT_PAISE ||
    fare.totalPaise >
    MAX_PAYMENT_AMOUNT_PAISE
  ) {

    throw new AppError(
      `Payment amount ${fare.totalPaise} is outside the allowed range.`,
      422,
      "PAYMENT_AMOUNT_OUT_OF_RANGE"
    );

  }

}

class PaymentService {

  async createOrder(
    input: CreateOrderInput
  ): Promise<CreateOrderResult> {

    const ride =
      await RideModel.findById(
        input.ride
      );

    if (!ride) {
      throw new AppError(
        "Ride not found.",
        404,
        "RIDE_NOT_FOUND"
      );
    }

    if (!(ride.status === RideStatus.ARRIVED_AT_DESTINATION &&
    ride.paymentStatus === RidePaymentStatus.PENDING)) {
      throw new AppError(
        "Ride is not ready for payment.",
        400,
        "RIDE_NOT_READY_FOR_PAYMENT"
      );
    }

    if (
      ride.rider.toString() !==
      input.rider.toString()
    ) {

      throw new AppError(
        "Unauthorized.",
        403,
        "FORBIDDEN"
      );

    }

    const existing =
      await paymentRepository.findByIdempotencyKey(
        input.idempotencyKey
      );

    if (existing) {

      return {

        paymentId:
          existing._id.toString(),
        gatewayOrderId:
          existing.gatewayOrderId,
        amountPaise:
          existing.amountPaise,
        currency:
          existing.currency,
        razorpayKeyId:
          process.env
            .RAZORPAY_KEY_ID!,
        status:
          existing.status,

      };

    }

    const release =
      await acquireLock(
        REDIS_KEYS.paymentOrderLock(
          input.ride.toString()
        ),
        IDEMPOTENCY_LOCK_TTL_MS
      );

    if (!release) {
      throw new AppError(
        "Payment order is already being created.",
        409,
        "PAYMENT_ORDER_IN_PROGRESS"
      );
    }

    try {
      const lockedRide =
        await RideModel.findById(
          input.ride.toString()
        );

      if (!lockedRide) {
        throw new AppError(
          "Ride not found.",
          404,
          "RIDE_NOT_FOUND"
        );
      }

      if (!lockedRide.driver) {
        throw new AppError(
          "Driver not assigned.",
          400,
          "DRIVER_NOT_ASSIGNED"
        );
      }

      const driver =  lockedRide.driver;
      const fareBreakdown = lockedRide.fare.breakdown;

      if (!fareBreakdown) {
        throw new AppError(
          "Fare breakdown missing.",
          500,
          "FARE_BREAKDOWN_MISSING"
        );
      }

      validateFareBreakdown(fareBreakdown);

      if (
        lockedRide.paymentStatus !==
        RidePaymentStatus.PENDING
      ) {
        throw new AppError(
          "Payment already processed.",
          409,
          "PAYMENT_ALREADY_COMPLETED"
        );
      }

      //Did this exact request already happen?
      const raced = await paymentRepository.findByIdempotencyKey(input.idempotencyKey);

      if (raced) {
        return {
          paymentId:raced._id.toString(),
          gatewayOrderId:raced.gatewayOrderId,
          amountPaise:raced.amountPaise,
          currency:raced.currency,
          razorpayKeyId:process.env.RAZORPAY_KEY_ID!,
          status:raced.status,
        };
      }

      const existingPayments = await paymentRepository.findByRide(input.ride.toString());

      //Does this ride already have a payment?
      const activePayment =
        existingPayments.find(
          (payment) =>
            payment.status !== PaymentStatus.FAILED
        );

      if (activePayment) {
        return {
          paymentId:activePayment._id.toString(),
          gatewayOrderId:activePayment.gatewayOrderId,
          amountPaise:activePayment.amountPaise,
          currency:activePayment.currency,
          razorpayKeyId:process.env.RAZORPAY_KEY_ID!,
          status:activePayment.status,
        };
      }

      const order =
        await razorpayClient.orders.create(
          {
            amount:lockedRide.fare.breakdown!.totalPaise,
            currency:CURRENCY.INR,
            receipt:input.ride.toString(),
            payment_capture: true,
            notes: {
              ride:lockedRide._id.toString(),
              rider:lockedRide.rider.toString(),
              driver:driver.toString(),
            },
          }
        );

      const payment =
        await paymentRepository.create(
          {
            ride:lockedRide._id,
            rider:lockedRide.rider,
            driver:driver,
            gateway:PaymentGateway.RAZORPAY,
            gatewayOrderId:order.id,
            amountPaise:lockedRide.fare.breakdown!.totalPaise,
            currency:CURRENCY.INR,
            status:PaymentStatus.CREATED,
            fareBreakdown,
            idempotencyKey:input.idempotencyKey,
            attemptNumber: 1,
            refundedAmountPaise: 0,
            metadata: {
              rideStatus:lockedRide.status,
              paymentStatus:lockedRide.paymentStatus,
              createdBy:"checkout",
            }
          }
        );

      return {
        paymentId:payment._id.toString(),
        gatewayOrderId:order.id,
        amountPaise:payment.amountPaise,
        currency:payment.currency,
        razorpayKeyId:process.env.RAZORPAY_KEY_ID!,
        status:payment.status,
      };

    } finally {
      await release();
    }
  }

  async verifyCheckoutSignature(
    input: VerifyCheckoutInput
  ): Promise<PaymentStatus> {

    const secret =
      process.env.RAZORPAY_KEY_SECRET!;

    const expectedSignature =
      createHmac(
        "sha256",
        secret
      )
        .update(
          `${input.gatewayOrderId}|${input.gatewayPaymentId}`
        )
        .digest("hex");

    const expectedBuffer =
      Buffer.from(
        expectedSignature,
        "hex"
      );

    const actualBuffer =
      Buffer.from(
        input.signature,
        "hex"
      );

    const valid =
      expectedBuffer.length ===
      actualBuffer.length &&
      timingSafeEqual(
        expectedBuffer,
        actualBuffer
      );

    if (!valid) {

      throw new AppError(
        "Invalid Razorpay signature.",
        400,
        "PAYMENT_SIGNATURE_INVALID"
      );

    }

    const payment =
      await paymentRepository.findByGatewayOrderId(
        input.gatewayOrderId
      );

    if (!payment) {

      throw new AppError(
        "Payment not found.",
        404,
        "PAYMENT_NOT_FOUND"
      );

    }

    if (
      payment.status ===
      PaymentStatus.CAPTURED
    ) {

      return payment.status;

    }

    const updatedPayment =
      await paymentRepository.transitionStatus(
        payment._id.toString(),

        PaymentStatus.CREATED,

        {
          status:
            PaymentStatus.PENDING,

          gatewayPaymentId:
            input.gatewayPaymentId,
        }
      );

    return (
      updatedPayment?.status ??
      payment.status
    );

  }

async handlePaymentCaptured(
  entity: RazorpayPaymentEntity
): Promise<void> {

  if (!entity.order_id || !entity.id) {
    throw new AppError(
      "Invalid Razorpay payment capture payload.",
      400,
      "INVALID_CAPTURE_PAYLOAD"
    );
  }

  const payment =
    await paymentRepository.findByGatewayOrderId(
      entity.order_id
    );

  if (!payment) {
    throw new AppError(
      "Payment not found.",
      404,
      "PAYMENT_NOT_FOUND"
    );
  }

  if (payment.status === PaymentStatus.CAPTURED) {
    return;
  }

  if (
    payment.status === PaymentStatus.FAILED ||
    payment.status === PaymentStatus.CANCELLED
  ) {
    throw new AppError(
      "Cannot capture a payment that is already failed or cancelled.",
      409,
      "INVALID_PAYMENT_STATE"
    );
  }

  if (payment.amountPaise !== entity.amount) {
    throw new AppError(
      "Captured amount mismatch.",
      409,
      "PAYMENT_AMOUNT_MISMATCH"
    );
  }

  const session = await mongoose.startSession();

  let updatedRide: typeof RideModel.prototype | null = null;

  try {

    await session.withTransaction(async () => {

      const transactionId =
        await ledgerService.recordTransaction(
          {
            entries: [
              {
                account: LedgerAccount.RIDER,
                entryType: LedgerEntryType.DEBIT,
                amountPaise: payment.amountPaise,
                description: `Payment received for ride ${payment.ride.toString()}`,
              },
              {
                account: LedgerAccount.PLATFORM,
                entryType: LedgerEntryType.CREDIT,
                amountPaise: payment.fareBreakdown.platformCommissionPaise,
                description: "Platform commission",
              },
              {
                account: LedgerAccount.DRIVER,
                entryType: LedgerEntryType.CREDIT,
                amountPaise: payment.fareBreakdown.driverEarningPaise,
                description: "Driver earning",
              },
            ],
            referenceType: LedgerReferenceType.PAYMENT,
            referenceId: payment._id,
          },
          session
        );

      const transitioned =
        await paymentRepository.transitionStatus(
          payment._id.toString(),
          payment.status,
          {
            ledgerTransactionId: transactionId,
            status: PaymentStatus.CAPTURED,
            gatewayPaymentId: entity.id,
            method:
              RAZORPAY_METHOD_MAP[entity.method] ??
              PaymentMethod.UNKNOWN,
            capturedAt: new Date(entity.created_at * 1000),
          },
          session
        );

      if (!transitioned) {
        return;
      }

      updatedRide =
        await RideModel.findByIdAndUpdate(
          payment.ride,
          {
            $set: {
              paymentStatus: RidePaymentStatus.CAPTURED,
            },
          },
          {
            session,
            new: true,
          }
        );

      if (!updatedRide) {
        throw new AppError(
          "Ride not found.",
          404,
          "RIDE_NOT_FOUND"
        );
      }

    });

    if (updatedRide) {
      emitPaymentCaptured(
        updatedRide.driver.toString(),
        {
          ride: updatedRide
        }
      );
    }

  } finally {
    await session.endSession();
  }

}

  async handlePaymentFailed(
    entity: RazorpayPaymentEntity
  ): Promise<void> {

    const payment =
      await paymentRepository.findByGatewayOrderId(
        entity.order_id
      );

    if (!payment) {
      return;
    }

    if (
      payment.status ===
      PaymentStatus.FAILED ||
      payment.status ===
      PaymentStatus.CAPTURED
    ) {
      return;
    }

    const updatedPayment =
      await paymentRepository.transitionStatus(
        payment._id.toString(),
        payment.status,
        {
          status: PaymentStatus.FAILED,

          failureReason:
            entity.error_description ??
            undefined,

          failureCode:
            entity.error_code ??
            undefined,
        }
      );

    if (!updatedPayment) {
      return;
    }

    await paymentRepository.incrementAttempts(
      payment._id.toString()
    );

    await RideModel.findByIdAndUpdate(
      payment.ride,
      {
        paymentStatus: RidePaymentStatus.FAILED,
      }
    );


  }

  async initiateRefund(
    input: InitiateRefundInput
  ): Promise<void> {

    const release =
      await acquireLock(
        REDIS_KEYS.refundLock(
          input.paymentId.toString()
        ),
        REFUND_LOCK_TTL_MS
      );

    if (!release) {

      throw new AppError(
        "Refund already in progress.",
        409,
        "REFUND_IN_PROGRESS"
      );

    }

    try {

      const payment =
        await paymentRepository.findById(
          input.paymentId.toString()
        );

      if (!payment) {

        throw new AppError(
          "Payment not found.",
          404,
          "PAYMENT_NOT_FOUND"
        );

      }

      if (
        payment.status !==
        PaymentStatus.CAPTURED &&
        payment.status !==
        PaymentStatus.PARTIALLY_REFUNDED
      ) {

        throw new AppError(
          `Cannot refund payment in status ${payment.status}`,
          409,
          "PAYMENT_NOT_REFUNDABLE"
        );

      }

      if (!payment.gatewayPaymentId) {

        throw new AppError(
          "Gateway payment id missing.",
          409,
          "PAYMENT_NOT_CAPTURED"
        );

      }

      const remainingAmount =
        payment.amountPaise -
        payment.refundedAmountPaise;

      const refundAmount =
        input.amountPaise ??
        remainingAmount;

      if (
        refundAmount <= 0 ||
        refundAmount >
        remainingAmount
      ) {

        throw new AppError(
          "Invalid refund amount.",
          422,
          "REFUND_AMOUNT_INVALID"
        );

      }

      const refund =
        await razorpayClient.payments.refund(
          payment.gatewayPaymentId,
          {
            amount:
              refundAmount,

            notes: {
              reason:
                input.reason,

              initiatedBy:
                input.initiatedBy.toString(),
            },
          }
        );

      const fraction =
        refundAmount /
        payment.amountPaise;

      const newRefundedAmount =
        payment.refundedAmountPaise +
        refundAmount;

      const newStatus =
        newRefundedAmount >=
          payment.amountPaise
          ? PaymentStatus.REFUNDED
          : PaymentStatus.PARTIALLY_REFUNDED;

      const session =
        await mongoose.startSession();

      try {

        await session.withTransaction(
          async () => {

            if (!payment.ledgerTransactionId) {

              throw new AppError(
                "Ledger transaction not found.",
                500,
                "LEDGER_TRANSACTION_NOT_FOUND"
              );

            }

            await ledgerService.reverseTransactionPartial(
              payment.ledgerTransactionId,
              fraction,
              LedgerReferenceType.REFUND,
              payment._id,
              input.reason,
              session
            );

            await paymentRepository.transitionStatus(
              payment._id.toString(),

              payment.status,

              {
                status:
                  newStatus,

                refundedAmountPaise:
                  newRefundedAmount,

                refundedAt:
                  new Date(),
              },
              session
            );

          }
        );

      } finally {
        await session.endSession();
      }
    } finally {
      await release();
    }
  }
}

export const paymentService =
  new PaymentService();