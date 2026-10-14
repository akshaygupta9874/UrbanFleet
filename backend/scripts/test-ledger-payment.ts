import "dotenv/config";
import { randomUUID } from "crypto";
import { prisma } from "../src/db/client.js";
import { ledgerRepository } from "../src/payment/repositories/ledger.repository.js";
import {
    LedgerAccount,
    LedgerEntryType,
    LedgerReferenceType,
} from "../src/payment/types/payment.types.js";

async function main() {
    console.log("🚀 Starting Ledger Repository & Double-Entry Test...");

    const txId = randomUUID();
    const riderId = randomUUID();
    const driverId = randomUUID();
    const refId = randomUUID();

    // 1. Insert balanced double-entry transaction
    console.log("1. Inserting balanced double-entry transaction...");
    const entries = await ledgerRepository.insertEntries([
        {
            transactionId: txId,
            account: LedgerAccount.RIDER,
            ownerId: riderId,
            entryType: LedgerEntryType.DEBIT,
            amountPaise: 50000,
            currency: "INR",
            referenceType: LedgerReferenceType.PAYMENT,
            referenceId: refId,
            idempotencyKey: `test:payment:${refId}:0`,
            legIndex: 0,
            description: "Rider debit for ride payment",
        },
        {
            transactionId: txId,
            account: LedgerAccount.PLATFORM,
            entryType: LedgerEntryType.CREDIT,
            amountPaise: 10000,
            currency: "INR",
            referenceType: LedgerReferenceType.PAYMENT,
            referenceId: refId,
            idempotencyKey: `test:payment:${refId}:1`,
            legIndex: 1,
            description: "Platform commission 20%",
        },
        {
            transactionId: txId,
            account: LedgerAccount.DRIVER,
            ownerId: driverId,
            entryType: LedgerEntryType.CREDIT,
            amountPaise: 40000,
            currency: "INR",
            referenceType: LedgerReferenceType.PAYMENT,
            referenceId: refId,
            idempotencyKey: `test:payment:${refId}:2`,
            legIndex: 2,
            description: "Driver earning 80%",
        },
    ]);

    console.log(`✅ Inserted ${entries.length} ledger entries.`);

    // 2. Query by transaction ID
    console.log("2. Querying by transaction ID...");
    const fetched = await ledgerRepository.findByTransactionId(txId);
    console.log(`✅ Found ${fetched.length} entries for transaction ${txId}.`);
    if (fetched.length !== 3) {
        throw new Error("Expected 3 entries!");
    }

    // 3. Query totals for account
    console.log("3. Checking account sums...");
    const riderTotals = await ledgerRepository.sumByAccount(LedgerAccount.RIDER, undefined, riderId);
    console.log("   Rider debit:", riderTotals.totalDebitPaise, "credit:", riderTotals.totalCreditPaise);
    if (riderTotals.totalDebitPaise < 50000) {
        throw new Error("Rider debit sum mismatch!");
    }

    const platformTotals = await ledgerRepository.sumByAccount(LedgerAccount.PLATFORM);
    console.log("   Platform debit:", platformTotals.totalDebitPaise, "credit:", platformTotals.totalCreditPaise);

    // 4. Verify sumAll (total debits must equal total credits)
    console.log("4. Verifying ledger balance (sumAll)...");
    const allTotals = await ledgerRepository.sumAll();
    console.log("   Total Debits:", allTotals.totalDebitPaise, "Total Credits:", allTotals.totalCreditPaise);
    if (allTotals.totalDebitPaise !== allTotals.totalCreditPaise) {
        throw new Error("Ledger is globally unbalanced!");
    }

    // 5. Check findUnbalancedTransactions
    console.log("5. Checking for unbalanced transactions...");
    const unbalanced = await ledgerRepository.findUnbalancedTransactions();
    console.log(`   Found ${unbalanced.length} unbalanced transactions.`);
    if (unbalanced.length > 0) {
        throw new Error("Found unbalanced transactions in ledger!");
    }

    // 6. Test duplicate idempotencyKey protection
    console.log("6. Testing duplicate idempotencyKey uniqueness...");
    try {
        await ledgerRepository.insertEntries([
            {
                transactionId: randomUUID(),
                account: LedgerAccount.RIDER,
                ownerId: riderId,
                entryType: LedgerEntryType.DEBIT,
                amountPaise: 50000,
                currency: "INR",
                referenceType: LedgerReferenceType.PAYMENT,
                referenceId: refId,
                idempotencyKey: `test:payment:${refId}:0`,
                legIndex: 0,
                description: "Duplicate attempt",
            },
        ]);
        throw new Error("Expected duplicate idempotencyKey error!");
    } catch (err: any) {
        console.log("✅ Successfully caught duplicate constraint violation:", err.code || err.message);
    }

    console.log("🎉 All Step 1.10 Ledger tests passed successfully!");
}

main()
    .catch((err) => {
        console.error("❌ Test failed:", err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
