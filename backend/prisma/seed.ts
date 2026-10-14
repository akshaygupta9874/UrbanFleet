// backend/prisma/seed.ts
import bcrypt from "bcryptjs";
import { prisma } from "../src/db/client.js";

async function main() {
    console.log("🌱 Seeding UrbanFleet PostgreSQL database...");

    if (process.env.NODE_ENV === "production" && !process.env.ALLOW_PRODUCTION_SEED) {
        throw new Error("Refusing to seed in production environment without explicit ALLOW_PRODUCTION_SEED flag.");
    }

    const passwordHash = await bcrypt.hash("Password@123", 10);

    // 1. Idempotently upsert Demo Rider
    const rider = await prisma.user.upsert({
        where: { email: "rider@urbanfleet.com" },
        update: {
            firstName: "John",
            lastName: "Rider",
            password: passwordHash,
            roles: ["RIDER"],
        },
        create: {
            firstName: "John",
            lastName: "Rider",
            email: "rider@urbanfleet.com",
            password: passwordHash,
            roles: ["RIDER"],
        },
    });
    console.log(`✅ Upserted Rider: ${rider.email} (${rider.id})`);

    // 2. Idempotently upsert Demo Driver User
    const driverUser = await prisma.user.upsert({
        where: { email: "driver@urbanfleet.com" },
        update: {
            firstName: "Alex",
            lastName: "Driver",
            password: passwordHash,
            roles: ["RIDER", "DRIVER"],
        },
        create: {
            firstName: "Alex",
            lastName: "Driver",
            email: "driver@urbanfleet.com",
            password: passwordHash,
            roles: ["RIDER", "DRIVER"],
        },
    });

    // 3. Idempotently ensure Driver Profile + Vehicle + Documents
    let driverProfile = await prisma.driver.findUnique({
        where: { userId: driverUser.id },
    });

    if (!driverProfile) {
        driverProfile = await prisma.driver.create({
            data: {
                userId: driverUser.id,
                isVerified: true,
                verificationStatus: "APPROVED",
                averageRating: 4.95,
                totalTrips: 150,
                completedTrips: 148,
                totalDistanceKm: 1250.50,
                totalEarningsPaise: 4500000n, // ₹45,000
            },
        });
    }

    await prisma.vehicle.upsert({
        where: { driverId: driverProfile.id },
        update: {
            type: "CAR",
            brand: "Toyota",
            model: "Prius Hybrid",
            color: "Pearl White",
            registrationNumber: "MH-02-UF-2026",
            registrationYear: 2024,
        },
        create: {
            driverId: driverProfile.id,
            type: "CAR",
            brand: "Toyota",
            model: "Prius Hybrid",
            color: "Pearl White",
            registrationNumber: "MH-02-UF-2026",
            registrationYear: 2024,
        },
    });

    await prisma.driverDocument.upsert({
        where: {
            driverId_type: {
                driverId: driverProfile.id,
                type: "DRIVING_LICENSE",
            },
        },
        update: {
            number: "DL-9876543210",
            frontImage: "https://placehold.co/600x400/png?text=Driving+License",
            isVerified: true,
        },
        create: {
            driverId: driverProfile.id,
            type: "DRIVING_LICENSE",
            number: "DL-9876543210",
            frontImage: "https://placehold.co/600x400/png?text=Driving+License",
            isVerified: true,
        },
    });

    console.log(`✅ Upserted Driver: ${driverUser.email} profile (${driverProfile.id})`);

    // 4. Idempotently upsert Admin User
    const admin = await prisma.user.upsert({
        where: { email: "admin@urbanfleet.com" },
        update: {
            firstName: "Sarah",
            lastName: "Admin",
            password: passwordHash,
            roles: ["ADMIN"],
        },
        create: {
            firstName: "Sarah",
            lastName: "Admin",
            email: "admin@urbanfleet.com",
            password: passwordHash,
            roles: ["ADMIN"],
        },
    });
    console.log(`✅ Upserted Admin: ${admin.email}`);

    console.log("🚀 Database seeding completed safely and idempotently!");
}

main()
    .catch((e) => {
        console.error("❌ Seeding failed:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });