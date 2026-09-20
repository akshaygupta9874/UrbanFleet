import { ClientSession, Types } from "mongoose";

import { LedgerEntryModel } from "../models/ledger.model.js";

import { ILedgerEntry } from "../types/payment.models.js";

import {
    CurrencyType,
    LedgerAccount,
    LedgerEntryType,
    LedgerReferenceType,
    Paise,
} from "../types/payment.types.js";

interface InsertableEntry {
    transactionId: string;

    account: LedgerAccount;

    ownerId?: Types.ObjectId | undefined;

    entryType: LedgerEntryType;

    amountPaise: Paise;

    currency: CurrencyType;

    referenceType: LedgerReferenceType;

    referenceId: Types.ObjectId;

    idempotencyKey?: string | undefined;

    legIndex?: number | undefined;

    description: string;

    metadata?: Record<string, unknown>;
}

export interface AccountTotals {
    totalDebitPaise: Paise;
    totalCreditPaise: Paise;
}

export interface UnbalancedTransaction {
    transactionId: string;
    debitPaise: Paise;
    creditPaise: Paise;
}

class LedgerRepository {
    async insertEntries(
        entries: InsertableEntry[],
        session: ClientSession
    ): Promise<ILedgerEntry[]> {
        if (entries.length === 0) {
            return [];
        }
        const docs = await LedgerEntryModel.insertMany(
            entries,
            {
                session,
                ordered: true,
            }
        );
        return docs as ILedgerEntry[];
    }

    async findByTransactionId(
        transactionId: string
    ): Promise<ILedgerEntry[]> {
        return LedgerEntryModel.find({
            transactionId,
        })
            .sort({
                createdAt: 1,
            })
            .lean(false)
            .exec();
    }

    async findByIdempotencyKey(
        idempotencyKey: string
    ): Promise<ILedgerEntry[]> {
        return LedgerEntryModel.find({
            idempotencyKey,
        })
            .sort({
                legIndex: 1,
            })
            .exec();
    }

    async listByReference(
        referenceType: LedgerReferenceType,
        referenceId: Types.ObjectId
    ): Promise<ILedgerEntry[]> {
        return LedgerEntryModel.find({
            referenceType,
            referenceId,
        })
            .sort({
                createdAt: 1,
            })
            .lean(false)
            .exec();
    }

    /**
     * Debit / credit totals of one account, optionally limited to a time range
     * and / or to one owner (e.g. a single driver).
     */
    async sumByAccount(
        account: LedgerAccount,
        range?: {
            from?: Date;
            to?: Date;
        },
        ownerId?: Types.ObjectId
    ): Promise<AccountTotals> {
        const match: Record<string, unknown> = {
            account,
        };

        if (ownerId) {
            match.ownerId = ownerId;
        }

        if (range?.from || range?.to) {

            match.createdAt = {
                ...(range.from
                    ? {
                        $gte: range.from,
                    }
                    : {}),
                ...(range.to
                    ? {
                        $lt: range.to,
                    }
                    : {}),
            };

        }
        return this.totalsFor(match);
    }

    /** Debit / credit totals over the WHOLE ledger (must always be equal). */
    async sumAll(): Promise<AccountTotals> {
        return this.totalsFor({});
    }

    /** Transactions whose debits and credits differ (should always be empty). */
    async findUnbalancedTransactions(
        limit = 100
    ): Promise<UnbalancedTransaction[]> {
        const rows =
            await LedgerEntryModel.aggregate<{
                _id: string;
                debit: number;
                credit: number;
            }>([
                {
                    $group: {
                        _id: "$transactionId",
                        debit: {
                            $sum: {
                                $cond: [
                                    { $eq: ["$entryType", LedgerEntryType.DEBIT] },
                                    "$amountPaise",
                                    0,
                                ],
                            },
                        },
                        credit: {
                            $sum: {
                                $cond: [
                                    { $eq: ["$entryType", LedgerEntryType.CREDIT] },
                                    "$amountPaise",
                                    0,
                                ],
                            },
                        },
                    },
                },
                {
                    $match: {
                        $expr: { $ne: ["$debit", "$credit"] },
                    },
                },
                { $limit: limit },
            ]).exec();

        return rows.map((row) => ({
            transactionId: row._id,
            debitPaise: row.debit,
            creditPaise: row.credit,
        }));
    }

    async listAll(
        limit = 100
    ): Promise<ILedgerEntry[]> {
        return LedgerEntryModel.find()
            .sort({
                createdAt: -1,
            })
            .limit(limit)
            .exec();
    }

    private async totalsFor(
        match: Record<string, unknown>
    ): Promise<AccountTotals> {
        const rows =
            await LedgerEntryModel.aggregate<{
                _id: LedgerEntryType;
                total: number;
            }>([
                {
                    $match: match,
                },
                {
                    $group: {
                        _id: "$entryType",
                        total: {
                            $sum: "$amountPaise",
                        },
                    },
                },
            ]).exec();

        const totalDebitPaise =
            rows.find(
                (row) =>
                    row._id ===
                    LedgerEntryType.DEBIT
            )?.total ?? 0;

        const totalCreditPaise =
            rows.find(
                (row) =>
                    row._id ===
                    LedgerEntryType.CREDIT
            )?.total ?? 0;

        return {
            totalDebitPaise,
            totalCreditPaise,
        };
    }

}

export const ledgerRepository =
    new LedgerRepository();
