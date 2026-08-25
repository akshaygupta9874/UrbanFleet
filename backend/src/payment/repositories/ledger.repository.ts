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

    entryType: LedgerEntryType;

    amountPaise: Paise;

    currency: CurrencyType;

    referenceType: LedgerReferenceType;

    referenceId: Types.ObjectId;

    description: string;

    metadata?: Record<string, unknown>;
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

    async sumByAccount(
        account: LedgerAccount,
        range?: {
            from?: Date;
            to?: Date;
        }
    ): Promise<{
        totalDebitPaise: Paise;
        totalCreditPaise: Paise;
    }> {
        const match: Record<string, unknown> = {
            account,
        };
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

}

export const ledgerRepository =
    new LedgerRepository();