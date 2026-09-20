import { ClientSession, Types } from "mongoose";

import { PayoutModel } from "../models/payout.model.js";

import { IPayout } from "../types/payment.models.js";

import { PayoutStatus } from "../types/payment.types.js";

import { LIVE_PAYOUT_STATUSES } from "../constants/payment.constants.js";

import { AppError } from "../../utils/AppError.js"; 

class PayoutRepository {

    async create(
        data: Partial<IPayout>,
        session?: ClientSession
    ): Promise<IPayout> {

        const docs = await PayoutModel.create(
            [data],
            { session }
        );

        if (!docs[0]) {
            throw new AppError(
                "Failed to create payout.",
                500,
                "PAYOUT_CREATE_FAILED"
            );
        }

        return docs[0];
    }

    async findById(
        id: string,
        session?: ClientSession 
    ): Promise<IPayout | null> {

        return PayoutModel.findById(id)
            .session(session ?? null)
            .exec();
    }

    async findByGatewayPayoutId(
        gatewayPayoutId: string,
        session?: ClientSession
    ): Promise<IPayout | null> {

        return PayoutModel.findOne({
            gatewayPayoutId,
        })
            .session(session ?? null)
            .exec();
    }

    /**
     * Compare-and-swap: applies `update` (which normally carries the new status)
     * only while the payout is in one of `fromStatuses`. Returns null otherwise.
     */
    async transition(
        payoutId: string,
        fromStatuses: readonly PayoutStatus[],
        update: Partial<IPayout>,
        session?: ClientSession
    ): Promise<IPayout | null> {

        return PayoutModel.findOneAndUpdate(
            {
                _id: new Types.ObjectId(payoutId),
                status: { $in: [...fromStatuses] },
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

    /** The PENDING / PROCESSING / PROCESSED payout of a payment, if any. */
    async findLiveByPayment(
        payment: string,
        session?: ClientSession
    ): Promise<IPayout | null> {

        return PayoutModel.findOne({
            payment: new Types.ObjectId(payment),
            status: { $in: [...LIVE_PAYOUT_STATUSES] },
        })
            .session(session ?? null)
            .exec();
    }

    /** Sum of payout amounts of a driver in the given statuses. */
    async sumAmountByDriver(
        driver: string,
        statuses: readonly PayoutStatus[]
    ): Promise<number> {

        const rows = await PayoutModel.aggregate<{ _id: null; total: number }>([
            {
                $match: {
                    driver: new Types.ObjectId(driver),
                    status: { $in: [...statuses] },
                },
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: "$amountPaise" },
                },
            },
        ]).exec();

        return rows[0]?.total ?? 0;
    }

    /** @deprecated unconditional write - prefer transition(), which is compare-and-swap. */
    async updateStatus(
        payoutId: string,
        status: PayoutStatus,
        update: Partial<IPayout> = {},
        session?: ClientSession
    ): Promise<IPayout | null> {

        return PayoutModel.findByIdAndUpdate(
            payoutId,
            {
                $set: {
                    status,
                    ...update,
                },
            },
            {
                new: true,
                session,
            }
        ).exec();
    }

    async update(
        payoutId: string,
        update: Partial<IPayout>,
        session?: ClientSession
    ): Promise<IPayout | null> {

        return PayoutModel.findByIdAndUpdate(
            payoutId,
            {
                $set: update,
            },
            {
                new: true,
                session,
            }
        ).exec();

    }

    async findPendingForDriver(
        driver: string
    ): Promise<IPayout[]> {

        return PayoutModel.find({
            driver: new Types.ObjectId(driver),
            status: {
                $in: [
                    PayoutStatus.PENDING,
                    PayoutStatus.PROCESSING,
                ],
            },
        })
            .sort({
                createdAt: 1,
            })
            .exec();
    }

    async findByPayment(
        payment: string,
        session?: ClientSession
    ): Promise<IPayout | null> {

        return PayoutModel.findOne({
            payment: new Types.ObjectId(payment),
        })
            .session(session ?? null)
            .exec();

    }

    async list(
        driver: string,
        page = 1,
        limit = 20
    ): Promise<{
        items: IPayout[];
        total: number;
    }> {

        const query = {
            driver: new Types.ObjectId(driver),
        };

        const [items, total] =
            await Promise.all([

                PayoutModel.find(query)
                    .sort({
                        createdAt: -1,
                    })
                    .skip(
                        (page - 1) * limit
                    )
                    .limit(limit)
                    .exec(),

                PayoutModel.countDocuments(
                    query
                ).exec(),

            ]);

        return {
            items,
            total,
        };
    }
}

export const payoutRepository =
    new PayoutRepository();
