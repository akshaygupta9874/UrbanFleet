import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  redisClient,
  connectRedis,
  disconnectRedis,
} from "../../src/redis/client.js";
import {
  updateDriverLocation,
  findNearbyDrivers,
} from "../../src/redis/services/geo.service.js";
import {
  isDriverAvailable,
  setDriverAvailable,
  setDriverOffline,
} from "../../src/redis/services/driver-presence.service.js";

const driverId = `ci-driver-presence-${crypto.randomUUID()}`;

describe("driver presence and Redis GEO", () => {
  beforeAll(async () => {
    await connectRedis();

    await redisClient.zRem("drivers:geo", driverId);
    await redisClient.del(`driver:presence:${driverId}`);
  });

  afterAll(async () => {
    await setDriverOffline(driverId);

    await redisClient.zRem("drivers:geo", driverId);
    await redisClient.del(`driver:presence:${driverId}`);

    await disconnectRedis();
  });

  it("discovers an available driver at the reported location", async () => {
    await setDriverAvailable(driverId);

    await updateDriverLocation(
      driverId,
      12.9716,
      77.5946,
    );

    expect(await isDriverAvailable(driverId)).toBe(true);

    const nearby = await findNearbyDrivers(
      12.9716,
      77.5946,
      1,
    );

    expect(nearby).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          driverId,
          distanceInKm: expect.any(Number),
        }),
      ]),
    );

    const match = nearby.find(
      (entry) => entry.driverId === driverId,
    );

    expect(match).toBeDefined();
    expect(match!.distanceInKm).toBeLessThan(0.01);
  });
});