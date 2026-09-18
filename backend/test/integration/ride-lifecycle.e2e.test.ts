import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { connectRedis, disconnectRedis, redisClient } from "../../src/redis/client.js";
import connectDB from "../../src/config/db.config.js";
import UserModel, { UserRole } from "../../src/models/user.model.js";
import { DriverModel } from "../../src/models/driver.model.js";
import { RideModel, RideStatus } from "../../src/models/ride.model.js";
import { RidePaymentStatus } from "../../src/models/ride.model.js";
import { createRide, acceptRide, arriveAtPickup, startRide, arriveAtDestination, completeRide } from "../../src/services/ride.service.js";

describe("ride lifecycle integration", () => {
  let riderId: mongoose.Types.ObjectId;
  let driverUserId: mongoose.Types.ObjectId;
  let driverId: mongoose.Types.ObjectId;
  let rideId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    await connectRedis();
    await connectDB();
  });

  afterAll(async () => {
    if (rideId) await RideModel.deleteOne({ _id: rideId });
    if (driverId) await DriverModel.deleteOne({ _id: driverId });
    if (riderId) await UserModel.deleteOne({ _id: riderId });
    if (driverUserId) await UserModel.deleteOne({ _id: driverUserId });
    await disconnectRedis();
    await mongoose.disconnect();
  });

  it("executes the end-to-end ride lifecycle for a rider and driver", async () => {
    const rider = await UserModel.create({
      firstName: "Rider",
      lastName: "Flow",
      email: "rider-flow@example.com",
      password: "Password1",
      role: [UserRole.RIDER],
    });
    riderId = rider._id;

    const driverUser = await UserModel.create({
      firstName: "Driver",
      lastName: "Flow",
      email: "driver-flow@example.com",
      password: "Password1",
      role: [UserRole.DRIVER],
    });
    driverUserId = driverUser._id;

    const driver = await DriverModel.create({
      user: driverUser._id,
      profilePhoto: { url: "https://example.com/driver.png", publicId: "driver-photo" },
      vehicleImages: { front: "", back: "", left: "", right: "", interior: "" },
      vehicle: {
        type: "CAR",
        brand: "Test",
        model: "Ride",
        color: "Black",
        registrationNumber: `FLOW-${Date.now()}`,
        registrationYear: 2024,
      },
      documents: {
        drivingLicense: { number: "DL-2", expiryDate: new Date(), frontImage: "", backImage: "", verified: true },
        registrationCertificate: { number: "RC-2", image: "", verified: true },
        insurance: { number: "INS-2", expiryDate: new Date(), image: "", verified: true },
        pollutionCertificate: { expiryDate: new Date(), image: "" },
      },
      isVerified: true,
      verificationStatus: "APPROVED",
      currentRide: null,
    });
    driverId = driver._id;

    const ride = await createRide({
      riderId: rider._id.toString(),
      pickup: {
        address: "Pickup address",
        coordinates: { latitude: 12.9716, longitude: 77.5946 },
      },
      destination: {
        address: "Destination address",
        coordinates: { latitude: 12.9816, longitude: 77.6046 },
      },
      estimatedFare: 1200,
      estimatedDistance: 8,
      estimatedDuration: 15,
    }, "car");
    rideId = ride._id;

    expect(ride.status).toBe(RideStatus.SEARCHING);

    const acceptedRide = await acceptRide({ rideId: ride._id.toString(), driverId: driver._id.toString() });
    expect(acceptedRide.status).toBe(RideStatus.DRIVER_ASSIGNED);

    const arrivedPickup = await arriveAtPickup({ rideId: ride._id.toString(), driverId: driver._id.toString() });
    expect(arrivedPickup.status).toBe(RideStatus.DRIVER_ARRIVING);

    const started = await startRide({ rideId: ride._id.toString(), driverId: driver._id.toString() });
    expect(started.status).toBe(RideStatus.STARTED);

    const arrivedDestination = await arriveAtDestination({ rideId: ride._id.toString(), driverId: driver._id.toString() });
    expect(arrivedDestination.status).toBe(RideStatus.ARRIVED_AT_DESTINATION);

    await RideModel.updateOne(
      { _id: ride._id },
      { $set: { paymentStatus: RidePaymentStatus.PAID } },
    );

    const finalRide = await completeRide({ rideId: ride._id.toString(), driverId: driver._id.toString() });
    expect(finalRide.status).toBe(RideStatus.COMPLETED);

    const savedRide = await RideModel.findById(ride._id).lean();
    expect(savedRide?.status).toBe(RideStatus.COMPLETED);
    expect(savedRide?.paymentStatus).toBe(RidePaymentStatus.PAID);

    const savedDriver = await DriverModel.findById(driver._id).lean();
    expect(savedDriver?.currentRide).toBeNull();
    expect(savedDriver?.statistics.completedTrips).toBe(1);
    expect(await redisClient.get(`driver:presence:${driver._id}`)).toContain('"available":true');
  });
});
