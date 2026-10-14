// backend/scripts/verify-step-1-7.ts
import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/db/client.js";
import { generateToken, verifyRefreshToken } from "../src/utils/generateToken.js";
import { redisClient } from "../src/redis/client.js";

async function verify() {
    console.log("🔍 Running Step 1.1 - 1.7 Verification Suite...\n");

    // 1. Verify PostgreSQL Connection & Table Counts
    const [userCount, driverCount, vehicleCount, docCount] = await Promise.all([
        prisma.user.count(),
        prisma.driver.count(),
        prisma.vehicle.count(),
        prisma.driverDocument.count(),
    ]);

    console.log("📊 PostgreSQL Counts:");
    console.log(`   - Users:            ${userCount}`);
    console.log(`   - Drivers:          ${driverCount}`);
    console.log(`   - Vehicles:         ${vehicleCount}`);
    console.log(`   - Driver Documents: ${docCount}`);

    if (userCount < 3) {
        throw new Error("Expected at least 3 users from seed.");
    }

    // 2. Test User Lookup & Password Check
    const testRider = await prisma.user.findUnique({
        where: { email: "rider@urbanfleet.com" },
    });

    if (!testRider) throw new Error("Seed rider not found");
    const passwordMatch = await bcrypt.compare("Password@123", testRider.password);
    console.log(`\n🔐 Rider Password Check: ${passwordMatch ? "PASSED" : "FAILED"}`);
    if (!passwordMatch) throw new Error("Password mismatch on seeded user");

    // 3. Test Driver + Vehicle + Document Relational Fetch
    const testDriver = await prisma.user.findUnique({
        where: { email: "driver@urbanfleet.com" },
        include: {
            driver: {
                include: {
                    vehicle: true,
                    documents: true,
                },
            },
        },
    });

    if (!testDriver?.driver?.vehicle || !testDriver.driver.documents.length) {
        throw new Error("Driver 1:1 relations missing");
    }
    console.log(`🚗 Driver Relational Query: PASSED (Vehicle: ${testDriver.driver.vehicle.brand} ${testDriver.driver.vehicle.model}, License: ${testDriver.driver.documents[0].number})`);

    // 4. Test Token Generation with Redis
    if (!redisClient.isOpen) {
        await redisClient.connect();
    }

    const testSessionId = "test-session-uuid-1234";
    const tokens = await generateToken({ id: testRider.id, sessionId: testSessionId });
    console.log(`🎟️ Token Generation: PASSED (Access token generated, Refresh token stored in Redis)`);

    const verifiedUserId = await verifyRefreshToken(tokens.refreshToken, testSessionId);
    console.log(`🔑 Refresh Token Redis Verification: ${verifiedUserId === testRider.id ? "PASSED" : "FAILED"}`);
    if (verifiedUserId !== testRider.id) throw new Error("Failed to verify refresh token against Redis");

    // Clean up test token from Redis
    await redisClient.del(`refresh-token:${testRider.id}:${testSessionId}`);
    await redisClient.quit();

    console.log("\n✅ ALL CHECKS PASSED SUCCESSFULLY! Up to Step 1.7 is 100% verified.");
}

verify()
    .catch((err) => {
        console.error("❌ Verification failed:", err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
        process.exit(0);
    });
