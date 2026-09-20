import { Schema, model, Model, Query } from "mongoose";

import { ILedgerEntry } from "../types/payment.models.js";

import {
    LedgerAccount,
    LedgerEntryType,
    LedgerReferenceType,
} from "../types/payment.types.js";

import { CURRENCY } from "../constants/payment.constants.js";

const LedgerEntrySchema = new Schema<ILedgerEntry>(
    {
        transactionId: {
            type: String,
            required: true,

        },

        account: {
            type: String,
            enum: Object.values(LedgerAccount),
            required: true,
            index: true,
        },

        // Which driver / rider this leg belongs to (PLATFORM and BANK legs have none).
        ownerId: {
            type: Schema.Types.ObjectId,
        },

        entryType: {
            type: String,
            enum: Object.values(LedgerEntryType),
            required: true,
        },

        amountPaise: {
            type: Number,
            required: true,
            validate: {
                validator: (v: number) =>
                    Number.isInteger(v) && v > 0,
                message:
                    "amountPaise must be a positive integer",
            },
        },

        currency: {
            type: String,
            required: true,
            default: CURRENCY.INR,
        },

        referenceType: {
            type: String,
            enum: Object.values(LedgerReferenceType),
            required: true,
            index: true, 
        },

        referenceId: {
            type: Schema.Types.ObjectId, 
            required: true,
            index: true, 
        },

        // Logical posting key ("payment:<id>:capture" ...). With legIndex it is
        // covered by a unique partial index => the same posting cannot be written twice.
        idempotencyKey: {
            type: String,
        },

        legIndex: {
            type: Number,
        },

        description: {
            type: String,
            required: true,
            trim: true,
        },

        metadata: {
            type: Schema.Types.Mixed,
            default: {},
        },
    },
    {
        
        timestamps: {
            createdAt: true,
            updatedAt: false,
        },
    }
);

LedgerEntrySchema.index({
    transactionId: 1,
});

LedgerEntrySchema.index({
    account: 1,
    createdAt: 1,
});

LedgerEntrySchema.index({
    referenceType: 1,
    referenceId: 1,
});

// Per-driver / per-rider balances.
LedgerEntrySchema.index({
    account: 1,
    ownerId: 1,
    createdAt: 1,
});

// Database-level guarantee against double posting. Entries written before this
// field existed have no idempotencyKey and are outside the index.
LedgerEntrySchema.index(
    {
        idempotencyKey: 1,
        legIndex: 1,
    },
    {
        unique: true,
        partialFilterExpression: {
            idempotencyKey: { $type: "string" },
        },
    }
);

function rejectMutation(
    this: Query<unknown, ILedgerEntry>
): void {
    throw new Error(
        "LedgerEntry is append-only: mutation and deletion are not permitted"
    );
}

LedgerEntrySchema.pre(
    "findOneAndUpdate",
    rejectMutation
);

LedgerEntrySchema.pre(
    "updateOne",
    rejectMutation
);

LedgerEntrySchema.pre(
    "updateMany",
    rejectMutation
);

LedgerEntrySchema.pre(
    "findOneAndDelete",
    rejectMutation
);

LedgerEntrySchema.pre(
    "deleteOne",
    rejectMutation
);

LedgerEntrySchema.pre(
    "deleteMany",
    rejectMutation
);

LedgerEntrySchema.pre(
    "replaceOne",
    rejectMutation
);

LedgerEntrySchema.pre(
    "findOneAndReplace",
    rejectMutation
);

// doc.deleteOne() / doc.save() on an existing entry
LedgerEntrySchema.pre(
    "deleteOne",
    { document: true, query: false },
    function (): void {
        throw new Error(
            "LedgerEntry is append-only: mutation and deletion are not permitted"
        );
    }
);

LedgerEntrySchema.pre(
    "save",
    function (): void {
        if (!this.isNew) {
            throw new Error(
                "LedgerEntry is append-only: mutation and deletion are not permitted"
            );
        }
    }
);

export const LedgerEntryModel: Model<ILedgerEntry> =
    model<ILedgerEntry>(
        "LedgerEntry",
        LedgerEntrySchema
    );
