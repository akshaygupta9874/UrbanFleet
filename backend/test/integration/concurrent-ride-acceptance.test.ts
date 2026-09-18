import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { connectRedis, disconnectRedis, redisClient } from "../../src/redis/client.js";
import connectDB from "../../src/config/db.config.js";
import UserModel, { UserRole } from "../../src/models/user.model.js";
import { DriverModel } from "../../src/models/driver.model.js";
import { RideModel, RideStatus } from "../../src/models/ride.model.js";
import { createRide, acceptRide } from "../../src/services/ride.service.js";

describe("concurrent accept race for a single ride", async () => {
  let riderId: mongoose.Types.ObjectId;
  let driverUserIdA: mongoose.Types.ObjectId;
  let driverUserIdB: mongoose.Types.ObjectId;
  let driverIdA: mongoose.Types.ObjectId;
  let driverIdB: mongoose.Types.ObjectId;
  let rideId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    await connectRedis();
    await connectDB();
  });

  afterAll(async () => {
    if (rideId) await RideModel.deleteOne({ _id: rideId });
    if (driverIdA) await DriverModel.deleteOne({ _id: driverIdA });
    if (driverIdB) await DriverModel.deleteOne({ _id: driverIdB });
    if (riderId) await UserModel.deleteOne({ _id: riderId });
    if (driverUserIdA) await UserModel.deleteOne({ _id: driverUserIdA });
    if (driverUserIdB) await UserModel.deleteOne({ _id: driverUserIdB });
    await disconnectRedis();
    await mongoose.disconnect();
  });

  it("allows only one driver to win the same ride assignment", async () => {
    const rider = await UserModel.create({
      firstName: "Race",
      lastName: "Rider",
      email: `race-rider-${Date.now()}@example.com`,
      password: "Password1",
      role: [UserRole.RIDER],
    });
    riderId = rider._id;

    const driverA = await UserModel.create({
      firstName: "Driver",
      lastName: "Alpha",
      email: `race-driver-a-${Date.now()}@example.com`,
      password: "Password1",
      role: [UserRole.DRIVER],
    });
    driverUserIdA = driverA._id;

    const driverB = await UserModel.create({
      firstName: "Driver",
      lastName: "Bravo",
      email: `race-driver-b-${Date.now()}@example.com`,
      password: "Password1",
      role: [UserRole.DRIVER],
    });
    driverUserIdB = driverB._id;

    const driverDocA = await DriverModel.create({
      user: driverA._id,
      profilePhoto: { url: "https://example.com/a.png", publicId: "a" },
      vehicleImages: { front: "", back: "", left: "", right: "", interior: "" },
      vehicle: { type: "CAR", brand: "A", model: "X", color: "Red", registrationNumber: `RACEA${Date.now()}`, registrationYear: 2024 },
      documents: { drivingLicense: { number: "DL-A", expiryDate: new Date(), frontImage: "", backImage: "", verified: true }, registrationCertificate: { number: "RC-A", image: "", verified: true }, insurance: { number: "INS-A", expiryDate: new Date(), image: "", verified: true }, pollutionCertificate: { expiryDate: new Date(), image: "" } },
      isVerified: true,
      verificationStatus: "APPROVED",
    });
    driverIdA = driverDocA._id;

    const driverDocB = await DriverModel.create({
      user: driverB._id,
      profilePhoto: { url: "https://example.com/b.png", publicId: "b" },
      vehicleImages: { front: "", back: "", left: "", right: "", interior: "" },
      vehicle: { type: "CAR", brand: "B", model: "Y", color: "Blue", registrationNumber: `RACEB${Date.now()}`, registrationYear: 2024 },
      documents: { drivingLicense: { number: "DL-B", expiryDate: new Date(), frontImage: "", backImage: "", verified: true }, registrationCertificate: { number: "RC-B", image: "", verified: true }, insurance: { number: "INS-B", expiryDate: new Date(), image: "", verified: true }, pollutionCertificate: { expiryDate: new Date(), image: "" } },
      isVerified: true,
      verificationStatus: "APPROVED",
    });
    driverIdB = driverDocB._id;

    const ride = await createRide({
      riderId: rider._id.toString(),
      pickup: { address: "Start", coordinates: { latitude: 12.97, longitude: 77.59 } },
      destination: { address: "End", coordinates: { latitude: 12.99, longitude: 77.61 } },
      estimatedFare: 1000,
      estimatedDistance: 5,
      estimatedDuration: 12,
    }, "car");
    rideId = ride._id;

    const [winnerResult, loserResult] = await Promise.allSettled([
      acceptRide({ rideId: ride._id.toString(), driverId: driverDocA._id.toString() }),
      acceptRide({ rideId: ride._id.toString(), driverId: driverDocB._id.toString() }),
    ]);

    const results = [winnerResult, loserResult];
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);

    const accepted = results.find((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof acceptRide>>> => result.status === "fulfilled")!.value;
    expect(accepted.status).toBe(RideStatus.DRIVER_ASSIGNED);

    const finalRide = await RideModel.findById(ride._id).lean();
    expect(finalRide?.driver?.toString()).toBe(accepted.driver?.toString());
    expect(finalRide?.status).toBe(RideStatus.DRIVER_ASSIGNED);

    const [savedDriverA, savedDriverB] = await Promise.all([
      DriverModel.findById(driverDocA._id).lean(),
      DriverModel.findById(driverDocB._id).lean(),
    ]);
    const winningDriver = accepted.driver?.toString();
    expect([savedDriverA?.currentRide, savedDriverB?.currentRide].filter(Boolean)).toHaveLength(1);
    expect((winningDriver === driverDocA._id.toString() ? savedDriverA : savedDriverB)?.currentRide?.toString()).toBe(ride._id.toString());
    expect((winningDriver === driverDocA._id.toString() ? savedDriverB : savedDriverA)?.currentRide ?? null).toBeNull();
  });
});
