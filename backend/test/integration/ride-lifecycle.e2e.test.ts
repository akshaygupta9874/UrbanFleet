import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectRedis, disconnectRedis } from "../../src/redis/client.js";
import { setDriverAvailable, isDriverAvailable } from "../../src/redis/services/driver-presence.service.js";
import { prisma } from "../../src/db/client.js";
import { UserRole, VerificationStatus, VehicleCategory, RideStatus, RidePaymentStatus } from "@prisma/client";
import {
  createRide,
  acceptRide,
  arriveAtPickup,
  startRide,
  arriveAtDestination,
  completeRide,
} from "../../src/services/ride.service.js";
import { AppError } from "../../src/utils/AppError.js";

describe("Ride Lifecycle State Machine E2E Integration", () => {
  let riderId: string;
  let driverUserId: string;
  let driverId: string;
  let vehicleId: string;
  let rideId: string;

  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    if (rideId) await prisma.ride.deleteMany({ where: { id: rideId } });
    if (vehicleId) await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
    if (driverId) await prisma.driver.deleteMany({ where: { id: driverId } });
    if (riderId) await prisma.user.deleteMany({ where: { id: riderId } });
    if (driverUserId) await prisma.user.deleteMany({ where: { id: driverUserId } });
    await disconnectRedis();
  });

  it("orchestrates the entire end-to-end ride lifecycle with state validation, payment gating, and driver metrics", async () => {
    const timestamp = Date.now();

    // 1. Create Rider in PostgreSQL
    const rider = await prisma.user.create({
      data: {
        firstName: "Alice",
        lastName: "Rider",
        email: `rider-flow-${timestamp}@example.com`,
        password: "HashedPassword123",
        roles: [UserRole.RIDER],
      },
    });
    riderId = rider.id;

    // 2. Create Driver and Vehicle in PostgreSQL
    const driverUser = await prisma.user.create({
      data: {
        firstName: "Bob",
        lastName: "Driver",
        email: `driver-flow-${timestamp}@example.com`,
        password: "HashedPassword123",
        roles: [UserRole.DRIVER],
      },
    });
    driverUserId = driverUser.id;

    const driver = await prisma.driver.create({
      data: {
        userId: driverUser.id,
        isVerified: true,
        verificationStatus: VerificationStatus.APPROVED,
      },
    });
    driverId = driver.id;

    const vehicle = await prisma.vehicle.create({
      data: {
        driverId: driver.id,
        type: VehicleCategory.CAR,
        brand: "Toyota",
        model: "Camry",
        color: "Silver",
        registrationNumber: `FLOW-${timestamp}`,
        registrationYear: 2023,
      },
    });
    vehicleId = vehicle.id;

    // Initialize driver presence
    await setDriverAvailable(driver.id);
    expect(await isDriverAvailable(driver.id)).toBe(true);

    // 3. Step 1: Create Ride -> SEARCHING
    const ride = await createRide(
      {
        riderId: rider.id,
        pickup: {
          address: "100ft Road, Indiranagar",
          coordinates: { latitude: 12.9716, longitude: 77.5946 },
        },
        destination: {
          address: "Koramangala 5th Block",
          coordinates: { latitude: 12.9352, longitude: 77.6245 },
        },
        estimatedFare: 1500,
        estimatedDistance: 8000, // 8 km
        estimatedDuration: 1200, // 20 mins
      },
      "car"
    );
    rideId = ride.id;

    expect(ride.status).toBe(RideStatus.SEARCHING);
    expect(ride.paymentStatus).toBe(RidePaymentStatus.PENDING);
    expect(ride.estimatedFarePaise).toBeGreaterThan(0);

    // 4. Step 2: Driver Accepts Ride -> DRIVER_ASSIGNED
    const acceptedRide = await acceptRide({
      rideId: ride.id,
      driverId: driver.id,
    });
    expect(acceptedRide.status).toBe(RideStatus.DRIVER_ASSIGNED);
    expect(acceptedRide.driverId).toBe(driver.id);

    // Driver should now be busy in Redis
    expect(await isDriverAvailable(driver.id)).toBe(false);

    // 5. Step 3: Driver Arrives at Pickup -> DRIVER_ARRIVING
    const arrivedPickup = await arriveAtPickup({
      rideId: ride.id,
      driverId: driver.id,
    });
    expect(arrivedPickup.status).toBe(RideStatus.DRIVER_ARRIVING);

    // 6. Step 4: Start Trip -> STARTED
    const startedRide = await startRide({
      rideId: ride.id,
      driverId: driver.id,
    });
    expect(startedRide.status).toBe(RideStatus.STARTED);
    expect(startedRide.startedAt).toBeDefined();

    // 7. Step 5: Arrive at Destination -> ARRIVED_AT_DESTINATION
    const arrivedDestination = await arriveAtDestination({
      rideId: ride.id,
      driverId: driver.id,
    });
    expect(arrivedDestination.status).toBe(RideStatus.ARRIVED_AT_DESTINATION);

    // 8. Payment Gating Check: Attempting to complete ride without payment must be rejected
    await expect(
      completeRide({
        rideId: ride.id,
        driverId: driver.id,
      })
    ).rejects.toThrow(AppError);

    // Simulate Rider successfully pays through gateway
    await prisma.ride.update({
      where: { id: ride.id },
      data: { paymentStatus: RidePaymentStatus.PAID },
    });

    // 9. Step 6: Complete Ride -> COMPLETED
    const finalRide = await completeRide({
      rideId: ride.id,
      driverId: driver.id,
    });
    expect(finalRide.status).toBe(RideStatus.COMPLETED);
    expect(finalRide.finalFarePaise).toBeGreaterThan(0);
    expect(finalRide.completedAt).toBeDefined();

    // 10. Verify Database State Post-Completion
    const savedRide = await prisma.ride.findUnique({
      where: { id: ride.id },
    });
    expect(savedRide?.status).toBe(RideStatus.COMPLETED);
    expect(savedRide?.paymentStatus).toBe(RidePaymentStatus.PAID);

    // 11. Verify Driver Statistics in PostgreSQL
    const savedDriver = await prisma.driver.findUnique({
      where: { id: driver.id },
    });
    expect(savedDriver?.totalTrips).toBe(1);
    expect(savedDriver?.completedTrips).toBe(1);
    expect(Number(savedDriver?.totalDistanceKm)).toBeGreaterThan(0);
    expect(Number(savedDriver?.totalEarningsPaise)).toBeGreaterThan(0);

    // 12. Verify Driver Availability is Restored in Redis
    expect(await isDriverAvailable(driver.id)).toBe(true);
  });
});
