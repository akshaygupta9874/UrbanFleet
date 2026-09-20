import { ClientSession, Types } from "mongoose";
import { PaymentModel } from "../models/payment.model.js";
import { IPayment, IRefundRecord } from "../types/payment.models.js";
import { Paise, PaymentStatus, RefundStatus } from "../types/payment.types.js"
import { AppError } from "../../utils/AppError.js";

export interface ListPaymentsFilter {
    rider?: string;
    driver?: string;
    ride?: string;
    status?: PaymentStatus;
}

export interface FailureInfo {
    failureReason?: string | undefined;
    failureCode?: string | undefined;
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

    async findByGatewayRefundId(
        gatewayRefundId: string,
        session?: ClientSession
    ): Promise<IPayment | null> {
        return PaymentModel.findOne({
            "refunds.gatewayRefundId": gatewayRefundId,
        })
            .session(session ?? null)
            .exec();
    }

    async findByRefundRecordId(
        refundId: string,
        session?: ClientSession
    ): Promise<IPayment | null> {
        if (!Types.ObjectId.isValid(refundId)) {
            return null;
        }

        return PaymentModel.findOne({
            "refunds._id": new Types.ObjectId(refundId),
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

    /**
     * Compare-and-swap on the payment status: the update is applied only if the
     * payment is CURRENTLY in `fromStatus` (or any of them when an array is given).
     * Returns the updated document, or null when somebody else moved it first.
     */
    async transitionStatus(
        paymentId: string,
        fromStatus: PaymentStatus | readonly PaymentStatus[],
        update: Partial<IPayment>,
        session?: ClientSession
    ): Promise<IPayment | null> {

        const statusFilter =
            Array.isArray(fromStatus)
                ? { $in: [...fromStatus] }
                : fromStatus;

        return PaymentModel.findOneAndUpdate(
            {
                _id: new Types.ObjectId(paymentId),
                status: statusFilter,
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

    /**
     * Atomically records one failed gateway attempt: status -> FAILED, failure
     * details, attemptNumber + 1. Idempotent per gateway payment id.
     */
    async recordFailedAttempt(
        paymentId: string,
        gatewayPaymentId: string,
        fromStatuses: readonly PaymentStatus[],
        failure: FailureInfo,
        session?: ClientSession
    ): Promise<IPayment | null> {

        const $set: Record<string, unknown> = {
            status: PaymentStatus.FAILED,
            lastFailedGatewayPaymentId: gatewayPaymentId,
        };

        if (failure.failureReason) {
            $set.failureReason = failure.failureReason;
        }

        if (failure.failureCode) {
            $set.failureCode = failure.failureCode;
        }

        return PaymentModel.findOneAndUpdate(
            {
                _id: new Types.ObjectId(paymentId),
                status: { $in: [...fromStatuses] },
                lastFailedGatewayPaymentId: { $ne: gatewayPaymentId },
            },
            {
                $set,
                $inc: { attemptNumber: 1 },
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

    // ------------------------------------------------------------------ refunds

    /**
     * Books a refund on the payment. Compare-and-swap on BOTH the status and the
     * refunded total the caller based its decision on: if either changed, null is
     * returned and nothing is written.
     */
    async bookRefund(
        paymentId: string,
        expected: { status: PaymentStatus; refundedAmountPaise: Paise },
        next: { status: PaymentStatus; refundedAmountPaise: Paise },
        record: IRefundRecord,
        session?: ClientSession
    ): Promise<IPayment | null> {

        return PaymentModel.findOneAndUpdate(
            {
                _id: new Types.ObjectId(paymentId),
                status: expected.status,
                refundedAmountPaise: expected.refundedAmountPaise,
            },
            {
                $set: {
                    status: next.status,
                    refundedAmountPaise: next.refundedAmountPaise,
                    refundedAt: new Date(),
                },
                $push: {
                    refunds: record,
                },
            },
            {
                returnDocument: "after",
                session,
            }
        ).exec();
    }

    /**
     * Updates fields of one refund record, only while it is in one of `fromStatuses`.
     * Returns null when the record is not (or no longer) in such a state.
     */
    async updateRefundRecord(
        paymentId: string,
        refundId: string,
        fromStatuses: readonly RefundStatus[],
        set: Partial<Omit<IRefundRecord, "_id">>,
        session?: ClientSession
    ): Promise<IPayment | null> {

        const $set: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(set)) {
            $set[`refunds.$.${key}`] = value;
        }

        return PaymentModel.findOneAndUpdate(
            {
                _id: new Types.ObjectId(paymentId),
                refunds: {
                    $elemMatch: {
                        _id: new Types.ObjectId(refundId),
                        status: { $in: [...fromStatuses] },
                    },
                },
            },
            { $set },
            {
                returnDocument: "after",
                session,
            }
        ).exec();
    }

    /**
     * Marks a refund FAILED and restores the payment's refunded total / status,
     * compare-and-swap on the refunded total the caller computed from.
     */
    async failRefund(
        paymentId: string,
        refundId: string,
        expectedRefundedAmountPaise: Paise,
        next: { status: PaymentStatus; refundedAmountPaise: Paise },
        failure: { failureReason: string; compensationLedgerTransactionId: string },
        session?: ClientSession
    ): Promise<IPayment | null> {

        return PaymentModel.findOneAndUpdate(
            {
                _id: new Types.ObjectId(paymentId),
                refundedAmountPaise: expectedRefundedAmountPaise,
                refunds: {
                    $elemMatch: {
                        _id: new Types.ObjectId(refundId),
                        status: {
                            $in: [
                                RefundStatus.PENDING,
                                RefundStatus.PROCESSED,
                            ],
                        },
                    },
                },
            },
            {
                $set: {
                    status: next.status,
                    refundedAmountPaise: next.refundedAmountPaise,
                    "refunds.$.status": RefundStatus.FAILED,
                    "refunds.$.failureReason": failure.failureReason,
                    "refunds.$.compensationLedgerTransactionId":
                        failure.compensationLedgerTransactionId,
                },
            },
            {
                returnDocument: "after",
                session,
            }
        ).exec();
    }

    // ---------------------------------------------------------- reconciliation

    /** Payments that are still waiting for money, in a bounded age window. */
    async findUnsettled(
        statuses: readonly PaymentStatus[],
        olderThan: Date,
        newerThan: Date,
        limit: number
    ): Promise<IPayment[]> {
        return PaymentModel.find({
            status: { $in: [...statuses] },
            createdAt: { $lt: olderThan, $gt: newerThan },
        })
            .sort({ createdAt: 1 })
            .limit(limit)
            .exec();
    }

    /** Payments having a PENDING refund booked before `olderThan`. */
    async findWithPendingRefunds(
        olderThan: Date,
        limit: number
    ): Promise<IPayment[]> {
        return PaymentModel.find({
            refunds: {
                $elemMatch: {
                    status: RefundStatus.PENDING,
                    createdAt: { $lt: olderThan },
                },
            },
        })
            .sort({ updatedAt: 1 })
            .limit(limit)
            .exec();
    }

    // ----------------------------------------------------------------- listing

    async list(
        filter: ListPaymentsFilter
    ): Promise<IPayment[]> {
        return PaymentModel
            .find(this.buildQuery(filter))
            .sort({ createdAt: -1 })
            .exec();
    }

    async listPaginated(
        filter: ListPaymentsFilter,
        page = 1,
        limit = 20
    ): Promise<{ items: IPayment[]; total: number }> {

        const query = this.buildQuery(filter);

        const [items, total] = await Promise.all([
            PaymentModel
                .find(query)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .exec(),
            PaymentModel.countDocuments(query).exec(),
        ]);

        return { items, total };
    }

    private buildQuery(
        filter: ListPaymentsFilter
    ): Record<string, unknown> {
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

        return query;
    }

}

export const paymentRepository =
    new PaymentRepository();
