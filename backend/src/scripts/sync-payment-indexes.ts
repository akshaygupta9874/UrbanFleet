/**
 * ONE-OFF MIGRATION - makes the MongoDB indexes match the schemas of the payment module.
 *
 * Why: the upgraded models add unique / partial indexes and replace two old payout index
 * definitions. Mongoose only creates *missing* indexes, so the old ones must be dropped.
 *
 * Copy to  src/scripts/sync-payment-indexes.ts  (the import paths below assume that place).
 *
 *   1. Preview (changes nothing):   npx tsx src/scripts/sync-payment-indexes.ts --dry-run
 *   2. Apply:                       npx tsx src/scripts/sync-payment-indexes.ts
 *
 * (Use ts-node / your build output instead of tsx if that is what your project uses.)
 * If you use dotenv, import it FIRST:  import "dotenv/config";
 *
 * WARNING: syncIndexes() drops every index on these three collections that is not declared in
 * the schemas - including indexes you may have added by hand (e.g. in Atlas). Read the
 * dry-run output first.
 */
import mongoose from "mongoose";

import dns from "node:dns";

dns.setServers(["1.1.1.1", "8.8.8.8"]);

import { PaymentModel } from "../payment/models/payment.model.js";
import { LedgerEntryModel } from "../payment/models/ledger.model.js";
import { PayoutModel } from "../payment/models/payout.model.js";
import "dotenv/config";

// Use the environment variable your project already uses for the MongoDB connection string.
const MONGODB_URI = process.env.MONGODB_URI ?? process.env.MONGODB_URI;

const DRY_RUN = process.argv.includes("--dry-run");

async function main(): Promise<void> {
    if (!MONGODB_URI) {
        throw new Error(
            "MongoDB connection string not found. Set MONGODB_URI, or edit this script to read your variable."
        );
    }

    await mongoose.connect(MONGODB_URI);

    for (const model of [PaymentModel, LedgerEntryModel, PayoutModel]) {
        const name = model.collection.name;

        const before = (await model.collection.indexes()).map((index) => index.name);
        console.log(`\n[${name}] indexes now:`, before);

        if (DRY_RUN) {
            const diff = await model.diffIndexes();
            console.log(`[${name}] would DROP  :`, diff.toDrop);
            console.log(`[${name}] would CREATE:`, diff.toCreate);
            continue;
        }

        const dropped = await model.syncIndexes();
        console.log(`[${name}] dropped:`, dropped);

        const after = (await model.collection.indexes()).map((index) => index.name);
        console.log(`[${name}] indexes after:`, after);
    }

    await mongoose.disconnect();

    console.log(DRY_RUN ? "\nDry run finished - nothing was changed." : "\nDone.");
}

main().catch(async (err) => {
    console.error(err);
    await mongoose.disconnect().catch(() => undefined);
    process.exit(1);
});
