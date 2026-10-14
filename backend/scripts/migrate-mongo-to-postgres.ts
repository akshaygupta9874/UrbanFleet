/**
 * MongoDB to PostgreSQL Data Migration Tool for UrbanFleet
 * 
 * Supports:
 * 1. JSON dumps (e.g. from mongoexport) in a directory (default: ./scripts/mongo-dump)
 * 2. Deterministic, bijective mapping from 24-hex Mongo ObjectIds to UUIDs:
 *    ObjectId("60b8d295f1d5d82b8c8d2345") -> "00000000-60b8-d295-f1d5-d82b8c8d2345"
 * 3. Strict 24-hex ObjectId validation.
 * 4. Atomic transaction boundaries with automatic rollback on failure.
 * 5. Exact source-to-destination record parity verification.
 */

import fs from "fs";
import path from "path";
import { prisma } from "../src/db/client.js";

const HEX_24_REGEX = /^[0-9a-fA-F]{24}$/;
const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function unwrapMongoId(mongoId: unknown): string {
    if (!mongoId) {
        throw new Error("mongoId cannot be empty or null");
    }
    const str = typeof mongoId === "object" && "$oid" in mongoId
        ? (mongoId as { $oid: unknown }).$oid
        : mongoId;
    if (typeof str !== "string") {
        throw new Error("MongoDB ObjectId must be a 24-character hexadecimal string or Extended JSON $oid.");
    }
    return str;
}

export function mongoIdToUuid(mongoId: unknown): string {
    const str = unwrapMongoId(mongoId);
    if (!HEX_24_REGEX.test(str)) {
        throw new Error(`Invalid MongoDB ObjectId: "${str}". Expected a 24-character hexadecimal string.`);
    }
    const clean = str.toLowerCase();
    const full = `00000000${clean}`;
    return `${full.slice(0, 8)}-${full.slice(8, 12)}-${full.slice(12, 16)}-${full.slice(16, 20)}-${full.slice(20, 32)}`;
}

export function normalizeLedgerReference(value: unknown): string | null {
    if (value === null || value === undefined || value === "") {
        return null;
    }
    if (typeof value === "object") {
        return mongoIdToUuid(value);
    }
    if (typeof value !== "string") {
        throw new Error("Ledger reference must be a string or MongoDB Extended JSON ObjectId.");
    }
    return HEX_24_REGEX.test(value) ? mongoIdToUuid(value) : value;
}

export function normalizeLedgerTransactionId(value: unknown, fallback: string): string {
    if (value === null || value === undefined || value === "") {
        return fallback;
    }
    if (typeof value !== "string") {
        return mongoIdToUuid(value);
    }
    if (HEX_24_REGEX.test(value)) {
        return mongoIdToUuid(value);
    }
    if (!UUID_REGEX.test(value)) {
        throw new Error(`Invalid ledger transaction ID: "${value}". Expected a UUID or MongoDB ObjectId.`);
    }
    return value;
}

function normalizeOptionalLedgerTransactionId(value: unknown): string | null {
    return value === null || value === undefined || value === ""
        ? null
        : normalizeLedgerTransactionId(value, "");
}

export function uuidToMongoId(uuid: string): string {
    const clean = uuid.replace(/-/g, "");
    if (!UUID_REGEX.test(uuid) || !clean.startsWith("00000000")) {
        throw new Error(`Invalid mapped UUID: "${uuid}". Expected 32-hex string starting with 00000000.`);
    }
    return clean.slice(8);
}

function parseJsonDump(filePath: string, collectionName: string): any[] {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Migration error: Dump file for "${collectionName}" not found at "${filePath}".`);
    }
    const content = fs.readFileSync(filePath, "utf-8").trim();
    if (!content) {
        return [];
    }

    // Support both newline-delimited JSON (mongoexport format) and standard JSON array
    const records = content.startsWith("[")
        ? JSON.parse(content)
        : content
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .map((line) => JSON.parse(line));

    if (
        !Array.isArray(records) ||
        records.some((record) => record === null || typeof record !== "object" || Array.isArray(record))
    ) {
        throw new Error(`Migration error: "${collectionName}" dump must contain a JSON array or newline-delimited JSON objects.`);
    }
    return records;
}

export async function runMigration(dumpDir = "./scripts/mongo-dump") {
    console.log(`🚀 Starting MongoDB -> PostgreSQL Data Migration from ${dumpDir}`);

    const resolvedDir = path.resolve(dumpDir);
    if (!fs.existsSync(resolvedDir)) {
        throw new Error(`Migration error: Dump directory does not exist at "${resolvedDir}". Please supply a valid directory containing mongoexport JSON dumps.`);
    }

    // Load and validate source files before starting database transaction
    const usersFile = path.join(resolvedDir, "users.json");
    const driversFile = path.join(resolvedDir, "drivers.json");
    const ridesFile = path.join(resolvedDir, "rides.json");
    const paymentsFile = path.join(resolvedDir, "payments.json");
    const payoutsFile = path.join(resolvedDir, "payouts.json");
    const ledgersFile = path.join(resolvedDir, "ledgers.json");

    const rawUsers = parseJsonDump(usersFile, "users");
    const rawDrivers = parseJsonDump(driversFile, "drivers");
    const rawRides = parseJsonDump(ridesFile, "rides");
    const rawPayments = parseJsonDump(paymentsFile, "payments");
    const rawPayouts = parseJsonDump(payoutsFile, "payouts");
    const rawLedgers = parseJsonDump(ledgersFile, "ledgers");

    for (const driver of rawDrivers) {
        if (driver.documents !== undefined && !Array.isArray(driver.documents)) {
            throw new Error(`Migration error: driver ${String(driver._id)} has a non-array documents field.`);
        }
        for (const document of driver.documents ?? []) {
            if (!document?.type || !document?.number) {
                throw new Error(`Migration error: every driver document must include type and number (driver ${String(driver._id)}).`);
            }
        }
    }

    const expectedCounts = {
        users: rawUsers.length,
        drivers: rawDrivers.length,
        vehicles: rawDrivers.filter((driver) => driver.vehicle).length,
        driverDocuments: rawDrivers.reduce(
            (count, driver) => count + (driver.documents?.length ?? 0),
            0
        ),
        rides: rawRides.length,
        payments: rawPayments.length,
        payouts: rawPayouts.length,
        ledgers: rawLedgers.length,
    };

    console.log(`📦 Loaded records from dump:`);
    console.log(`  - Users: ${expectedCounts.users}`);
    console.log(`  - Drivers: ${expectedCounts.drivers}`);
    console.log(`  - Vehicles: ${expectedCounts.vehicles}`);
    console.log(`  - Driver documents: ${expectedCounts.driverDocuments}`);
    console.log(`  - Rides: ${expectedCounts.rides}`);
    console.log(`  - Payments: ${expectedCounts.payments}`);
    console.log(`  - Payouts: ${expectedCounts.payouts}`);
    console.log(`  - Ledgers: ${expectedCounts.ledgers}`);

    const sourceIds = {
        users: [] as string[],
        drivers: [] as string[],
        rides: [] as string[],
        payments: [] as string[],
        payouts: [] as string[],
        ledgers: [] as string[],
    };

    await prisma.$transaction(async (tx) => {
        // 1. Users
        for (const u of rawUsers) {
            const id = mongoIdToUuid(u._id);
            sourceIds.users.push(id);
            const roles = Array.isArray(u.roles) ? u.roles : ["RIDER"];
            await tx.user.upsert({
                where: { id },
                update: {
                    firstName: u.firstName || "Unknown",
                    lastName: u.lastName || "User",
                    email: u.email,
                    password: u.password || "",
                    googleId: u.googleId || null,
                    roles,
                    createdAt: u.createdAt ? new Date(u.createdAt.$date || u.createdAt) : new Date(),
                    updatedAt: u.updatedAt ? new Date(u.updatedAt.$date || u.updatedAt) : new Date(),
                },
                create: {
                    id,
                    firstName: u.firstName || "Unknown",
                    lastName: u.lastName || "User",
                    email: u.email,
                    password: u.password || "",
                    googleId: u.googleId || null,
                    roles,
                    createdAt: u.createdAt ? new Date(u.createdAt.$date || u.createdAt) : new Date(),
                    updatedAt: u.updatedAt ? new Date(u.updatedAt.$date || u.updatedAt) : new Date(),
                },
            });
        }

        // 2. Drivers, Vehicles & Driver Documents
        for (const d of rawDrivers) {
            const id = mongoIdToUuid(d._id);
            sourceIds.drivers.push(id);
            const userId = mongoIdToUuid(d.user || d.userId);
            
            await tx.driver.upsert({
                where: { id },
                update: {
                    userId,
                    profilePhoto: d.profilePhoto || null,
                    isVerified: !!d.isVerified,
                    verificationStatus: d.verificationStatus || "PENDING",
                    averageRating: d.averageRating ?? 5.0,
                    totalRatings: d.totalRatings ?? 0,
                    totalTrips: d.totalTrips ?? 0,
                    completedTrips: d.completedTrips ?? 0,
                    cancelledTrips: d.cancelledTrips ?? 0,
                    totalDistanceKm: d.totalDistanceKm ?? 0,
                    totalEarningsPaise: BigInt(d.totalEarningsPaise ?? 0),
                    lastOnlineAt: d.lastOnlineAt ? new Date(d.lastOnlineAt.$date || d.lastOnlineAt) : null,
                    createdAt: d.createdAt ? new Date(d.createdAt.$date || d.createdAt) : new Date(),
                    updatedAt: d.updatedAt ? new Date(d.updatedAt.$date || d.updatedAt) : new Date(),
                },
                create: {
                    id,
                    userId,
                    profilePhoto: d.profilePhoto || null,
                    isVerified: !!d.isVerified,
                    verificationStatus: d.verificationStatus || "PENDING",
                    averageRating: d.averageRating ?? 5.0,
                    totalRatings: d.totalRatings ?? 0,
                    totalTrips: d.totalTrips ?? 0,
                    completedTrips: d.completedTrips ?? 0,
                    cancelledTrips: d.cancelledTrips ?? 0,
                    totalDistanceKm: d.totalDistanceKm ?? 0,
                    totalEarningsPaise: BigInt(d.totalEarningsPaise ?? 0),
                    lastOnlineAt: d.lastOnlineAt ? new Date(d.lastOnlineAt.$date || d.lastOnlineAt) : null,
                    createdAt: d.createdAt ? new Date(d.createdAt.$date || d.createdAt) : new Date(),
                    updatedAt: d.updatedAt ? new Date(d.updatedAt.$date || d.updatedAt) : new Date(),
                },
            });

            // Vehicle
            if (d.vehicle) {
                await tx.vehicle.upsert({
                    where: { driverId: id },
                    update: {
                        type: d.vehicle.type || "CAR",
                        brand: d.vehicle.brand || "Standard",
                        model: d.vehicle.model || "Sedan",
                        color: d.vehicle.color || "Black",
                        registrationNumber: d.vehicle.registrationNumber || `REG-${id.slice(0, 8)}`,
                        registrationYear: d.vehicle.registrationYear || 2022,
                        images: d.vehicle.images || null,
                    },
                    create: {
                        driverId: id,
                        type: d.vehicle.type || "CAR",
                        brand: d.vehicle.brand || "Standard",
                        model: d.vehicle.model || "Sedan",
                        color: d.vehicle.color || "Black",
                        registrationNumber: d.vehicle.registrationNumber || `REG-${id.slice(0, 8)}`,
                        registrationYear: d.vehicle.registrationYear || 2022,
                        images: d.vehicle.images || null,
                    },
                });
            }

            // Documents
            if (Array.isArray(d.documents)) {
                for (const doc of d.documents) {
                    await tx.driverDocument.upsert({
                        where: {
                            driverId_type: {
                                driverId: id,
                                type: doc.type,
                            },
                        },
                        update: {
                            number: doc.number,
                            expiryDate: doc.expiryDate ? new Date(doc.expiryDate.$date || doc.expiryDate) : null,
                            frontImage: doc.frontImage || "",
                            backImage: doc.backImage || null,
                            isVerified: !!doc.isVerified,
                        },
                        create: {
                            driverId: id,
                            type: doc.type,
                            number: doc.number,
                            expiryDate: doc.expiryDate ? new Date(doc.expiryDate.$date || doc.expiryDate) : null,
                            frontImage: doc.frontImage || "",
                            backImage: doc.backImage || null,
                            isVerified: !!doc.isVerified,
                        },
                    });
                }
            }
        }

        // 3. Rides
        for (const r of rawRides) {
            const id = mongoIdToUuid(r._id);
            sourceIds.rides.push(id);
            const riderId = mongoIdToUuid(r.rider || r.riderId);
            const driverId = r.driver || r.driverId ? mongoIdToUuid(r.driver || r.driverId) : null;

            await tx.ride.upsert({
                where: { id },
                update: {
                    riderId,
                    driverId,
                    pickup: r.pickup || {},
                    destination: r.destination || {},
                    estimatedFarePaise: r.estimatedFarePaise ?? r.fare?.estimated ?? 0,
                    finalFarePaise: r.finalFarePaise ?? r.fare?.final ?? null,
                    fareBreakdown: r.fareBreakdown ?? r.fare?.breakdown ?? null,
                    estimatedDistanceMeters: r.estimatedDistanceMeters ?? r.distance?.estimated ?? 0,
                    actualDistanceMeters: r.actualDistanceMeters ?? r.distance?.actual ?? null,
                    estimatedDurationSeconds: r.estimatedDurationSeconds ?? r.duration?.estimated ?? 0,
                    actualDurationSeconds: r.actualDurationSeconds ?? r.duration?.actual ?? null,
                    status: r.status || "SEARCHING",
                    paymentStatus: r.paymentStatus || "PENDING",
                    cancelledBy: r.cancelledBy || null,
                    cancellationReason: r.cancellationReason || null,
                    startedAt: r.startedAt ? new Date(r.startedAt.$date || r.startedAt) : null,
                    completedAt: r.completedAt ? new Date(r.completedAt.$date || r.completedAt) : null,
                    cancelledAt: r.cancelledAt ? new Date(r.cancelledAt.$date || r.cancelledAt) : null,
                    createdAt: r.createdAt ? new Date(r.createdAt.$date || r.createdAt) : new Date(),
                    updatedAt: r.updatedAt ? new Date(r.updatedAt.$date || r.updatedAt) : new Date(),
                },
                create: {
                    id,
                    riderId,
                    driverId,
                    pickup: r.pickup || {},
                    destination: r.destination || {},
                    estimatedFarePaise: r.estimatedFarePaise ?? r.fare?.estimated ?? 0,
                    finalFarePaise: r.finalFarePaise ?? r.fare?.final ?? null,
                    fareBreakdown: r.fareBreakdown ?? r.fare?.breakdown ?? null,
                    estimatedDistanceMeters: r.estimatedDistanceMeters ?? r.distance?.estimated ?? 0,
                    actualDistanceMeters: r.actualDistanceMeters ?? r.distance?.actual ?? null,
                    estimatedDurationSeconds: r.estimatedDurationSeconds ?? r.duration?.estimated ?? 0,
                    actualDurationSeconds: r.actualDurationSeconds ?? r.duration?.actual ?? null,
                    status: r.status || "SEARCHING",
                    paymentStatus: r.paymentStatus || "PENDING",
                    cancelledBy: r.cancelledBy || null,
                    cancellationReason: r.cancellationReason || null,
                    startedAt: r.startedAt ? new Date(r.startedAt.$date || r.startedAt) : null,
                    completedAt: r.completedAt ? new Date(r.completedAt.$date || r.completedAt) : null,
                    cancelledAt: r.cancelledAt ? new Date(r.cancelledAt.$date || r.cancelledAt) : null,
                    createdAt: r.createdAt ? new Date(r.createdAt.$date || r.createdAt) : new Date(),
                    updatedAt: r.updatedAt ? new Date(r.updatedAt.$date || r.updatedAt) : new Date(),
                },
            });
        }

        // 4. Payments
        for (const p of rawPayments) {
            const id = mongoIdToUuid(p._id);
            sourceIds.payments.push(id);
            const rideId = mongoIdToUuid(p.ride || p.rideId);
            const riderId = mongoIdToUuid(p.rider || p.riderId);
            const driverId = p.driver || p.driverId ? mongoIdToUuid(p.driver || p.driverId) : null;

            await tx.payment.upsert({
                where: { id },
                update: {
                    rideId,
                    riderId,
                    driverId,
                    gateway: p.gateway || "RAZORPAY",
                    gatewayOrderId: p.gatewayOrderId || null,
                    gatewayPaymentId: p.gatewayPaymentId || null,
                    amountPaise: p.amountPaise ?? 0,
                    currency: p.currency || "INR",
                    status: p.status || "PENDING",
                    method: p.method || null,
                    fareBreakdown: p.fareBreakdown || null,
                    idempotencyKey: p.idempotencyKey || null,
                    attemptNumber: p.attemptNumber ?? 1,
                    failureReason: p.failureReason || null,
                    failureCode: p.failureCode || null,
                    lastFailedGatewayPaymentId: p.lastFailedGatewayPaymentId || null,
                    refundedAmountPaise: p.refundedAmountPaise ?? 0,
                    refunds: p.refunds || [],
                    ledgerTransactionId: normalizeOptionalLedgerTransactionId(p.ledgerTransactionId),
                    metadata: p.metadata || null,
                    capturedAt: p.capturedAt ? new Date(p.capturedAt.$date || p.capturedAt) : null,
                    refundedAt: p.refundedAt ? new Date(p.refundedAt.$date || p.refundedAt) : null,
                    createdAt: p.createdAt ? new Date(p.createdAt.$date || p.createdAt) : new Date(),
                    updatedAt: p.updatedAt ? new Date(p.updatedAt.$date || p.updatedAt) : new Date(),
                },
                create: {
                    id,
                    rideId,
                    riderId,
                    driverId,
                    gateway: p.gateway || "RAZORPAY",
                    gatewayOrderId: p.gatewayOrderId || null,
                    gatewayPaymentId: p.gatewayPaymentId || null,
                    amountPaise: p.amountPaise ?? 0,
                    currency: p.currency || "INR",
                    status: p.status || "PENDING",
                    method: p.method || null,
                    fareBreakdown: p.fareBreakdown || null,
                    idempotencyKey: p.idempotencyKey || null,
                    attemptNumber: p.attemptNumber ?? 1,
                    failureReason: p.failureReason || null,
                    failureCode: p.failureCode || null,
                    lastFailedGatewayPaymentId: p.lastFailedGatewayPaymentId || null,
                    refundedAmountPaise: p.refundedAmountPaise ?? 0,
                    refunds: p.refunds || [],
                    ledgerTransactionId: normalizeOptionalLedgerTransactionId(p.ledgerTransactionId),
                    metadata: p.metadata || null,
                    capturedAt: p.capturedAt ? new Date(p.capturedAt.$date || p.capturedAt) : null,
                    refundedAt: p.refundedAt ? new Date(p.refundedAt.$date || p.refundedAt) : null,
                    createdAt: p.createdAt ? new Date(p.createdAt.$date || p.createdAt) : new Date(),
                    updatedAt: p.updatedAt ? new Date(p.updatedAt.$date || p.updatedAt) : new Date(),
                },
            });
        }

        // 5. Payouts
        for (const po of rawPayouts) {
            const id = mongoIdToUuid(po._id);
            sourceIds.payouts.push(id);
            const driverId = mongoIdToUuid(po.driver || po.driverId);
            const rideId = mongoIdToUuid(po.ride || po.rideId);
            const paymentId = po.payment || po.paymentId ? mongoIdToUuid(po.payment || po.paymentId) : null;

            await tx.payout.upsert({
                where: { id },
                update: {
                    driverId,
                    paymentId,
                    rideId,
                    amountPaise: po.amountPaise ?? 0,
                    currency: po.currency || "INR",
                    status: po.status || "PENDING",
                    mode: po.mode || "IMPS",
                    gatewayPayoutId: po.gatewayPayoutId || null,
                    utr: po.utr || null,
                    ledgerTransactionId: normalizeOptionalLedgerTransactionId(po.ledgerTransactionId),
                    reversalLedgerTransactionId: normalizeOptionalLedgerTransactionId(po.reversalLedgerTransactionId),
                    failureReason: po.failureReason || null,
                    metadata: po.metadata || null,
                    processedAt: po.processedAt ? new Date(po.processedAt.$date || po.processedAt) : null,
                    failedAt: po.failedAt ? new Date(po.failedAt.$date || po.failedAt) : null,
                    reversedAt: po.reversedAt ? new Date(po.reversedAt.$date || po.reversedAt) : null,
                    createdAt: po.createdAt ? new Date(po.createdAt.$date || po.createdAt) : new Date(),
                    updatedAt: po.updatedAt ? new Date(po.updatedAt.$date || po.updatedAt) : new Date(),
                },
                create: {
                    id,
                    driverId,
                    paymentId,
                    rideId,
                    amountPaise: po.amountPaise ?? 0,
                    currency: po.currency || "INR",
                    status: po.status || "PENDING",
                    mode: po.mode || "IMPS",
                    gatewayPayoutId: po.gatewayPayoutId || null,
                    utr: po.utr || null,
                    ledgerTransactionId: normalizeOptionalLedgerTransactionId(po.ledgerTransactionId),
                    reversalLedgerTransactionId: normalizeOptionalLedgerTransactionId(po.reversalLedgerTransactionId),
                    failureReason: po.failureReason || null,
                    metadata: po.metadata || null,
                    processedAt: po.processedAt ? new Date(po.processedAt.$date || po.processedAt) : null,
                    failedAt: po.failedAt ? new Date(po.failedAt.$date || po.failedAt) : null,
                    reversedAt: po.reversedAt ? new Date(po.reversedAt.$date || po.reversedAt) : null,
                    createdAt: po.createdAt ? new Date(po.createdAt.$date || po.createdAt) : new Date(),
                    updatedAt: po.updatedAt ? new Date(po.updatedAt.$date || po.updatedAt) : new Date(),
                },
            });
        }

        // 6. Ledger Entries
        for (const l of rawLedgers) {
            const id = mongoIdToUuid(l._id);
            sourceIds.ledgers.push(id);
            const transactionId = normalizeLedgerTransactionId(l.transactionId, id);
            const ownerId = normalizeLedgerReference(l.ownerId);
            const referenceId = normalizeLedgerReference(l.referenceId);

            await tx.ledgerEntry.upsert({
                where: { id },
                update: {
                    transactionId,
                    account: l.account,
                    entryType: l.entryType,
                    amountPaise: BigInt(l.amountPaise ?? 0),
                    currency: l.currency || "INR",
                    ownerId,
                    referenceType: l.referenceType || "PAYMENT",
                    referenceId,
                    idempotencyKey: l.idempotencyKey || null,
                    legIndex: l.legIndex ?? null,
                    description: l.description || null,
                    metadata: l.metadata || null,
                    createdAt: l.createdAt ? new Date(l.createdAt.$date || l.createdAt) : new Date(),
                },
                create: {
                    id,
                    transactionId,
                    account: l.account,
                    entryType: l.entryType,
                    amountPaise: BigInt(l.amountPaise ?? 0),
                    currency: l.currency || "INR",
                    ownerId,
                    referenceType: l.referenceType || "PAYMENT",
                    referenceId,
                    idempotencyKey: l.idempotencyKey || null,
                    legIndex: l.legIndex ?? null,
                    description: l.description || null,
                    metadata: l.metadata || null,
                    createdAt: l.createdAt ? new Date(l.createdAt.$date || l.createdAt) : new Date(),
                },
            });
        }

        // 7. Parity Verification
        console.log("🔍 Verifying exact record parity between MongoDB source and PostgreSQL destination...");

        async function verifyParity(
            label: string,
            ids: string[],
            expected: number,
            countSourceIds: (ids: string[]) => Promise<number>,
            countDestination: () => Promise<number>
        ): Promise<void> {
            const [sourceIdCount, destinationCount] = await Promise.all([
                ids.length > 0 ? countSourceIds(ids) : Promise.resolve(0),
                countDestination(),
            ]);
            if (sourceIdCount !== expected || destinationCount !== expected) {
                throw new Error(
                    `Parity mismatch for ${label}! Source has ${expected} records; ` +
                    `${sourceIdCount} source IDs and ${destinationCount} total records found in PostgreSQL.`
                );
            }
        }

        await verifyParity(
            "Users",
            sourceIds.users,
            expectedCounts.users,
            (ids) => tx.user.count({ where: { id: { in: ids } } }),
            () => tx.user.count()
        );
        await verifyParity(
            "Drivers",
            sourceIds.drivers,
            expectedCounts.drivers,
            (ids) => tx.driver.count({ where: { id: { in: ids } } }),
            () => tx.driver.count()
        );
        await verifyParity(
            "Vehicles",
            [],
            expectedCounts.vehicles,
            () => Promise.resolve(0),
            () => tx.vehicle.count()
        );
        await verifyParity(
            "Driver documents",
            [],
            expectedCounts.driverDocuments,
            () => Promise.resolve(0),
            () => tx.driverDocument.count()
        );
        await verifyParity(
            "Rides",
            sourceIds.rides,
            expectedCounts.rides,
            (ids) => tx.ride.count({ where: { id: { in: ids } } }),
            () => tx.ride.count()
        );
        await verifyParity(
            "Payments",
            sourceIds.payments,
            expectedCounts.payments,
            (ids) => tx.payment.count({ where: { id: { in: ids } } }),
            () => tx.payment.count()
        );
        await verifyParity(
            "Payouts",
            sourceIds.payouts,
            expectedCounts.payouts,
            (ids) => tx.payout.count({ where: { id: { in: ids } } }),
            () => tx.payout.count()
        );
        await verifyParity(
            "Ledger Entries",
            sourceIds.ledgers,
            expectedCounts.ledgers,
            (ids) => tx.ledgerEntry.count({ where: { id: { in: ids } } }),
            () => tx.ledgerEntry.count()
        );
    }, {
        timeout: 600000,
    });

    console.log("✅ Data Migration completed successfully with 100% verified source parity!");

    // Summary counts
    const [
        userCount,
        driverCount,
        vehicleCount,
        driverDocumentCount,
        rideCount,
        paymentCount,
        payoutCount,
        ledgerCount,
    ] = await Promise.all([
        prisma.user.count(),
        prisma.driver.count(),
        prisma.vehicle.count(),
        prisma.driverDocument.count(),
        prisma.ride.count(),
        prisma.payment.count(),
        prisma.payout.count(),
        prisma.ledgerEntry.count(),
    ]);

    console.log("📊 PostgreSQL Database Summary:");
    console.log(`- Total Users: ${userCount}`);
    console.log(`- Total Drivers: ${driverCount}`);
    console.log(`- Total Vehicles: ${vehicleCount}`);
    console.log(`- Total Driver Documents: ${driverDocumentCount}`);
    console.log(`- Total Rides: ${rideCount}`);
    console.log(`- Total Payments: ${paymentCount}`);
    console.log(`- Total Payouts: ${payoutCount}`);
    console.log(`- Total Ledger Entries: ${ledgerCount}`);
}

if (process.argv[1]?.includes("migrate-mongo-to-postgres")) {
    const dumpPath = process.argv[2] || "./scripts/mongo-dump";
    runMigration(dumpPath)
        .catch((err) => {
            console.error("❌ Migration failed:", err);
            process.exit(1);
        })
        .finally(() => prisma.$disconnect());
}
