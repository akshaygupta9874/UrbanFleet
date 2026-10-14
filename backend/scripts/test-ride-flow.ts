// backend/scripts/test-ride-flow.ts
import "dotenv/config";
import { prisma } from "../src/db/client.js";
import { redisClient } from "../src/redis/client.js";
import {
    createRide,
    acceptRide,
    arriveAtPickup,
    startRide,
    arriveAtDestination,
    getRideById,
    previewRideFare,
} from "../src/services/ride.service.js";

async function testRideFlow() {
    console.log("🚕 Testing PostgreSQL Ride Lifecycle Flow...\n");

    if (!redisClient.isOpen) {
        await redisClient.connect();
    }

    // 1. Fetch seeded rider and driver
    const rider = await prisma.user.findUnique({
        where: { email: "rider@urbanfleet.com" },
    });
    const driverUser = await prisma.user.findUnique({
        where: { email: "driver@urbanfleet.com" },
        include: { driver: true },
    });

    if (!rider || !driverUser?.driver) {
        throw new Error("Seeded rider or driver not found in PostgreSQL");
    }

    const driverId = driverUser.driver.id;
    const riderId = rider.id;

    // Clean any leftover rides from earlier tests
    await prisma.ride.deleteMany({
        where: { riderId },
    });

    console.log("1️⃣ Step: createRide");
    const ride = await createRide(
        {
            riderId,
            pickup: {
                address: "Marine Drive, Mumbai",
                coordinates: { latitude: 18.9438, longitude: 72.8232 },
            },
            destination: {
                address: "Bandra Kurla Complex, Mumbai",
                coordinates: { latitude: 19.0657, longitude: 72.8687 },
            },
            estimatedFare: 35000,
            estimatedDistance: 15200, // 15.2 km
            estimatedDuration: 1800,  // 30 mins
        },
        "CAR"
    );

    console.log(`   ✅ Ride created: ${ride.id} with status ${ride.status}`);
    if (ride.status !== "SEARCHING") throw new Error("Expected status SEARCHING");

    console.log("\n2️⃣ Step: acceptRide (with SELECT ... FOR UPDATE row-level lock)");
    const acceptedRide = await acceptRide({
        rideId: ride.id,
        driverId,
    });
    console.log(`   ✅ Ride accepted: ${acceptedRide.id} by driver ${driverId}, status: ${acceptedRide.status}`);
    if (acceptedRide.status !== "DRIVER_ASSIGNED") throw new Error("Expected status DRIVER_ASSIGNED");

    console.log("\n3️⃣ Step: arriveAtPickup");
    const arrivedRide = await arriveAtPickup({
        rideId: ride.id,
        driverId,
    });
    console.log(`   ✅ Driver arrived at pickup: status: ${arrivedRide.status}`);
    if (arrivedRide.status !== "DRIVER_ARRIVING") throw new Error("Expected status DRIVER_ARRIVING");

    console.log("\n4️⃣ Step: startRide");
    const startedRide = await startRide({
        rideId: ride.id,
        driverId,
    });
    console.log(`   ✅ Ride started: status: ${startedRide.status}`);
    if (startedRide.status !== "STARTED") throw new Error("Expected status STARTED");

    console.log("\n5️⃣ Step: arriveAtDestination");
    const arrivedDestRide = await arriveAtDestination({
        rideId: ride.id,
        driverId,
    });
    console.log(`   ✅ Arrived at destination: status: ${arrivedDestRide.status}`);
    if (arrivedDestRide.status !== "ARRIVED_AT_DESTINATION") throw new Error("Expected status ARRIVED_AT_DESTINATION");

    console.log("\n6️⃣ Step: previewRideFare");
    const farePreview = await previewRideFare({
        rideId: ride.id,
        userId: riderId,
    });
    console.log(`   ✅ Final Fare Calculated: ₹${Number(farePreview.fare.final) / 100} (totalPaise: ${farePreview.fare.final})`);

    // Clean up test ride
    await prisma.ride.delete({
        where: { id: ride.id },
    });

    await redisClient.quit();
    console.log("\n🎉 ALL RIDE LIFECYCLE STEPS PASSED SUCCESSFULLY IN POSTGRESQL!");
}

testRideFlow()
    .catch((err) => {
        console.error("❌ Ride flow test failed:", err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
        process.exit(0);
    });
