import { Response } from "express";
import { createHash } from "crypto";
import { Types } from "mongoose";
import {
  AppError,
} from "../../utils/AppError.js";
import asyncTryCatchHandler from "../../middlewares/TryCatch.js";
import { paymentService } from "../services/payment.service.js";
import { paymentRepository } from "../repositories/payment.repository.js";
import { PaymentStatus } from "../types/payment.types.js";
import { AuthenticatedRequest } from "../../middlewares/auth.middleware.js";
import UserModel, { UserRole } from "../../models/user.model.js";

function deriveIdempotencyKey(
  ride: string,
  rider: string
): string {

  return createHash("sha256")
    .update(`${ride}:${rider}`)
    .digest("hex");

}

export const createOrder =
  asyncTryCatchHandler(async (
    req: AuthenticatedRequest,
    res: Response
  ) => {
    if (!req.userId) {
      throw new AppError(
        "Unaauthenticated",
        400,
        "Unaauthenticated"
      );
    }

    const {
      rideId,
    } = req.body;

    const result =
      await paymentService.createOrder({
        ride: rideId,
        rider: new Types.ObjectId(req.userId),
        idempotencyKey:
          deriveIdempotencyKey(rideId, req.userId),
      });

    res.status(201).json({
      data: result,
    });

  });

export const verifyCheckout =
  asyncTryCatchHandler(async (
    req: AuthenticatedRequest,
    res: Response
  ) => {

    if (!req.userId) {
      throw new AppError(
        "Unaauthenticated",
        400,
        "Unaauthenticated"
      );
    }

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    const status =
      await paymentService.verifyCheckoutSignature({

        gatewayOrderId:
          razorpay_order_id,

        gatewayPaymentId:
          razorpay_payment_id,

        signature:
          razorpay_signature,

      });

    res.status(200).json({
      data: {
        status,
      },
    });

  });

export const getPayment =
  asyncTryCatchHandler(async (
    req: AuthenticatedRequest,
    res: Response
  ) => {

    if (!req.userId) {
      throw new AppError(
        "Unaauthenticated",
        400,
        "Unaauthenticated"
      );
    }

    if (!req.params.paymentId) {
      throw new AppError(
        "Payment id is required.",
        400,
        "PAYMENT_ID_REQUIRED"
      );
    }

    const payment =
      await paymentRepository.findById(
        req.params.paymentId
      );

    if (!payment) {

      throw new AppError(
        "Payment not found",
        404,
        "PAYMENT_NOT_FOUND"
      );

    }


    const isOwner =
      payment.rider.toString() ===
      req.userId ||
      payment.driver.toString() ===
      req.userId;
    const user = await UserModel.findById(req.userId).select("-password")
    if (!user) {

      throw new AppError(
        "User not found",
        404,
        "USER_NOT_FOUND"
      );

    }
    if (
      !isOwner &&
      !user.role.includes(UserRole.ADMIN)
    ) {

      throw new AppError(
        "Not authorized to view this payment",
        403,
        "FORBIDDEN"
      );

    }

    res.status(200).json({
      data: payment,
    });

  });

export const getPaymentsByRide =
  asyncTryCatchHandler(async (
    req: AuthenticatedRequest,
    res: Response
  ) => {

    if (!req.userId) {
      throw new AppError(
        "Unaauthenticated",
        400,
        "Unaauthenticated"
      );
    }

    if (!req.params.rideId) {
      throw new AppError(
        "Ride id is required.",
        400,
        "RIDE_ID_REQUIRED"
      );
    }

    const payments =
      await paymentRepository.findByRide(
        req.params.rideId
      );

    const owns =
      payments.some(
        (payment) =>
          payment.rider.toString() ===
          req.userId ||
          payment.driver.toString() ===
          req.userId
      );
    const user = await UserModel.findById(req.userId).select("-password")
    if (!user) {

      throw new AppError(
        "User not found",
        404,
        "USER_NOT_FOUND"
      );

    }

    if (
      payments.length > 0 &&
      !owns &&
      !user.role.includes(UserRole.ADMIN)
    ) {

      throw new AppError(
        "Not authorized to view these payments",
        403,
        "FORBIDDEN"
      );

    }

    res.status(200).json({
      data: payments,
    });

  });

export const listPayments =
  asyncTryCatchHandler(async (
    req: AuthenticatedRequest,
    res: Response
  ) => {

    if (!req.userId) {
      throw new AppError(
        "Unaauthenticated",
        400,
        "Unaauthenticated"
      );
    }
    const {
      page,
      limit,
      status,
    } = req.query;

    const user = await UserModel.findById(req.userId).select("-password")
    if (!user) {

      throw new AppError(
        "User not found",
        404,
        "USER_NOT_FOUND"
      );

    }

    const filter =
      user.role.includes(UserRole.ADMIN)
        ? {
          status:
            status as PaymentStatus | undefined,
        }
        : {
          rider:
            req.userId,

          status:
            status as PaymentStatus | undefined,
        };

    const result =
      await paymentRepository.list(
        filter
      );

    res.status(200).json({
      data: result,
    });

  });

export const refundPayment =
  asyncTryCatchHandler(async (
    req: AuthenticatedRequest,
    res: Response
  ) => {

    if (!req.userId) {
      throw new AppError(
        "Unaauthenticated",
        400,
        "Unaauthenticated"
      );
    }

    const {
      amountPaise,
      reason,
    } = req.body;

    await paymentService.initiateRefund({

      paymentId:
        new Types.ObjectId(
          req.params.paymentId
        ),

      amountPaise,

      reason,

      initiatedBy:
        new Types.ObjectId(
          req.userId
        ),

    });

    res.status(202).json({

      message:
        "Refund initiated",

    });

  });