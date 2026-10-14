// backend/src/db/client.ts
import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is missing.");
}

// 1. Connection Pool Tuning for High-Concurrency Ride Hailing
const pool = new Pool({
    connectionString,
    max: 20, // Max 20 concurrent connections in the pool
    idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
    connectionTimeoutMillis: 5000, // Fail fast if Postgres cannot be reached
});

// 2. Attach Driver Adapter
const adapter = new PrismaPg(pool);

// 3. Export Singleton Client Instance
export const prisma = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
});