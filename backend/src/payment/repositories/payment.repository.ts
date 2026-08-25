import { ClientSession, Types } from "mongoose";
import { PaymentModel } from "../models/payment.model.js";
import { IPayment } from "../types/payment.models.js";
import { PaymentStatus } from "../types/payment.types.js"
import { AppError } from "../../utils/AppError.js";

export interface ListPaymentsFilter {
    rider?: string;
    driver?: string;
    ride?: string;
    status?: PaymentStatus;
}

class PaymentRepository {

    async create(
        data: Partial<IPayment>,
        session?: ClientSession
    ): Promise<IPayment> {

        const docs =
            await PaymentModel.create(
                [data],
                { session }
            );

        if (!docs[0]) {
            throw new AppError(
                "Failed to create payment.",
                500,
                "PAYMENT_CREATE_FAILED"
            );
        }
        return docs[0];
    }

    async findById(
        id: string,
        session?: ClientSession
    ): Promise<IPayment | null> {

        return PaymentModel.findById(id)
            .session(session ?? null)
            .exec();

    }

    async findByGatewayOrderId(
        gatewayOrderId: string,
        session?: ClientSession
    ): Promise<IPayment | null> {
        return PaymentModel.findOne({
            gatewayOrderId,
        })
            .session(session ?? null)
            .exec();
    }

    async findByGatewayPaymentId(
        gatewayPaymentId: string,
        session?: ClientSession
    ): Promise<IPayment | null> {
        return PaymentModel.findOne({
            gatewayPaymentId,
        })
            .session(session ?? null)
            .exec();
    }

    async findByIdempotencyKey(
        idempotencyKey: string,
        session?: ClientSession
    ): Promise<IPayment | null> {
        return PaymentModel.findOne({
            idempotencyKey,
        })
            .session(session ?? null)
            .exec();
    }

    async findByRide(
        ride: string,
        session?: ClientSession
    ): Promise<IPayment[]> {
        return PaymentModel.find({
            ride: new Types.ObjectId(ride),
        })
            .sort({
                createdAt: -1,
            })
            .session(session ?? null)
            .exec();
    }

    async transitionStatus(
        paymentId: string,
        fromStatus: PaymentStatus,
        update: Partial<IPayment>,
        session?: ClientSession
    ): Promise<IPayment | null> {

        return PaymentModel.findOneAndUpdate(
            {
                _id: new Types.ObjectId(paymentId),
                status: fromStatus,
            },
            {
                $set: update,
            },
            {
                returnDocument: "after",
                session,
            }
        ).exec();
    }

    async incrementAttempts(
        paymentId: string,
        session?: ClientSession
    ): Promise<void> {

        await PaymentModel.updateOne(
            {
                _id: new Types.ObjectId(paymentId),
            },
            {
                $inc: {
                    attemptNumber: 1,
                },
            },
            {
                session,
            }
        ).exec();

    }

    async update(
        paymentId: string,
        update: Partial<IPayment>,
        session?: ClientSession
    ): Promise<IPayment | null> {

        return PaymentModel.findByIdAndUpdate(
            paymentId,
            {
                $set: update,
            },
            {
                new: true,
                session,
            }
        ).exec();
    }

    async list(
        filter: ListPaymentsFilter
    ): Promise<IPayment[]> {
        const query: Record<string, unknown> = {};

        if (filter.rider) {
            query.rider = new Types.ObjectId(filter.rider);
        }

        if (filter.driver) {
            query.driver = new Types.ObjectId(filter.driver);
        }

        if (filter.ride) {
            query.ride = new Types.ObjectId(filter.ride);
        }

        if (filter.status) {
            query.status = filter.status;
        }

        return PaymentModel
            .find(query)
            .sort({ createdAt: -1 })
            .exec();
    }

}

export const paymentRepository =
    new PaymentRepository();