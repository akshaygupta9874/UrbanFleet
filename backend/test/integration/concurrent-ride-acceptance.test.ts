import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { connectRedis, disconnectRedis } from "../../src/redis/client.js";
import { isDriverAvailable } from "../../src/redis/services/driver-presence.service.js";
import { prisma } from "../../src/db/client.js";
import { UserRole, VerificationStatus, VehicleCategory, RideStatus } from "@prisma/client";
import { createRide, acceptRide } from "../../src/services/ride.service.js";

describe("Concurrent Ride Acceptance Race Condition", () => {
  let riderId: string;
  let driverUserIdA: string;
  let driverUserIdB: string;
  let driverIdA: string;
  let driverIdB: string;
  let vehicleIdA: string;
  let vehicleIdB: string;
  let rideId: string;

  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    if (rideId) await prisma.ride.deleteMany({ where: { id: rideId } });
    if (vehicleIdA) await prisma.vehicle.deleteMany({ where: { id: vehicleIdA } });
    if (vehicleIdB) await prisma.vehicle.deleteMany({ where: { id: vehicleIdB } });
    if (driverIdA) await prisma.driver.deleteMany({ where: { id: driverIdA } });
    if (driverIdB) await prisma.driver.deleteMany({ where: { id: driverIdB } });
    if (riderId) await prisma.user.deleteMany({ where: { id: riderId } });
    if (driverUserIdA) await prisma.user.deleteMany({ where: { id: driverUserIdA } });
    if (driverUserIdB) await prisma.user.deleteMany({ where: { id: driverUserIdB } });
    await disconnectRedis();
  });

  it("enforces PostgreSQL row-level locks and allows only one driver to claim the ride", async () => {
    const timestamp = Date.now();

    // 1. Create Rider in PostgreSQL
    const rider = await prisma.user.create({
      data: {
        firstName: "Race",
        lastName: "Rider",
        email: `race-rider-${timestamp}@example.com`,
        password: "HashedPassword123",
        roles: [UserRole.RIDER],
      },
    });
    riderId = rider.id;

    // 2. Create Driver A in PostgreSQL
    const driverUserA = await prisma.user.create({
      data: {
        firstName: "Driver",
        lastName: "Alpha",
        email: `driver-alpha-${timestamp}@example.com`,
        password: "HashedPassword123",
        roles: [UserRole.DRIVER],
      },
    });
    driverUserIdA = driverUserA.id;

    const driverDocA = await prisma.driver.create({
      data: {
        userId: driverUserA.id,
        isVerified: true,
        verificationStatus: VerificationStatus.APPROVED,
      },
    });
    driverIdA = driverDocA.id;

    const vehicleA = await prisma.vehicle.create({
      data: {
        driverId: driverDocA.id,
        type: VehicleCategory.CAR,
        brand: "Tesla",
        model: "Model 3",
        color: "Midnight Silver",
        registrationNumber: `RACE-A-${timestamp}`,
        registrationYear: 2024,
      },
    });
    vehicleIdA = vehicleA.id;

    // 3. Create Driver B in PostgreSQL
    const driverUserB = await prisma.user.create({
      data: {
        firstName: "Driver",
        lastName: "Bravo",
        email: `driver-bravo-${timestamp}@example.com`,
        password: "HashedPassword123",
        roles: [UserRole.DRIVER],
      },
    });
    driverUserIdB = driverUserB.id;

    const driverDocB = await prisma.driver.create({
      data: {
        userId: driverUserB.id,
        isVerified: true,
        verificationStatus: VerificationStatus.APPROVED,
      },
    });
    driverIdB = driverDocB.id;

    const vehicleB = await prisma.vehicle.create({
      data: {
        driverId: driverDocB.id,
        type: VehicleCategory.CAR,
        brand: "BMW",
        model: "i4",
        color: "Portimao Blue",
        registrationNumber: `RACE-B-${timestamp}`,
        registrationYear: 2024,
      },
    });
    vehicleIdB = vehicleB.id;

    // 4. Create a Ride in SEARCHING status
    const ride = await createRide(
      {
        riderId: rider.id,
        pickup: {
          address: "MG Road Metro Station",
          coordinates: { latitude: 12.9716, longitude: 77.5946 },
        },
        destination: {
          address: "Indiranagar 100ft Road",
          coordinates: { latitude: 12.9784, longitude: 77.6408 },
        },
        estimatedFare: 1250,
        estimatedDistance: 6000,
        estimatedDuration: 900,
      },
      "car"
    );
    rideId = ride.id;

    expect(ride.status).toBe(RideStatus.SEARCHING);
    expect(ride.riderId).toBe(rider.id);

    // 5. Concurrently race both drivers to accept the exact same ride
    const [resultA, resultB] = await Promise.allSettled([
      acceptRide({ rideId: ride.id, driverId: driverDocA.id }),
      acceptRide({ rideId: ride.id, driverId: driverDocB.id }),
    ]);

    const results = [resultA, resultB];
    const fulfilled = results.filter(
      (r): r is PromiseFulfilledResult<any> => r.status === "fulfilled"
    );
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected"
    );

    // Atomicity assertion: Exactly one driver wins, exactly one fails
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const winningRide = fulfilled[0].value;
    expect(winningRide.status).toBe(RideStatus.DRIVER_ASSIGNED);
    const winningDriverId = winningRide.driverId;
    expect([driverDocA.id, driverDocB.id]).toContain(winningDriverId);

    // Losing rejection reason verification
    expect(rejected[0].reason.message).toMatch(/already accepted|not found/i);

    // 6. Direct PostgreSQL Database Verification
    const finalRideInDb = await prisma.ride.findUnique({
      where: { id: ride.id },
    });
    expect(finalRideInDb).not.toBeNull();
    expect(finalRideInDb?.status).toBe(RideStatus.DRIVER_ASSIGNED);
    expect(finalRideInDb?.driverId).toBe(winningDriverId);

    // 7. Redis Presence State Verification
    const isWinnerAvailable = await isDriverAvailable(winningDriverId);
    expect(isWinnerAvailable).toBe(false); // Winner marked busy in Redis
  });
});
