// src/services/matching.service.ts

import { findNearbyDrivers } from "../redis/services/geo.service.js";
import { isDriverAvailable } from "../redis/services/driver-presence.service.js";
import { prisma } from "../db/client.js";
import { RideStatus } from "@prisma/client";
import type { NearbyDriver } from "../redis/types.js";

export async function findEligibleDrivers(
    latitude: number,
    longitude: number,
    radiusKm: number = 50000,
    count: number = 20
): Promise<NearbyDriver[]> {

    const nearbyDrivers = await findNearbyDrivers(
        latitude,
        longitude,
        radiusKm,
        count
    );

    const eligibleDrivers: NearbyDriver[] = [];

    for (const driver of nearbyDrivers) {

        const available = await isDriverAvailable(
            driver.driverId
        );

        if (!available) {
            continue;
        }

        const activeRide = await prisma.ride.findFirst({
            where: {
                driverId: driver.driverId,
                status: {
                    in: [
                        RideStatus.DRIVER_ASSIGNED,
                        RideStatus.DRIVER_ARRIVING,
                        RideStatus.STARTED,
                    ],
                },
            },
            select: { id: true },
        });

        if (activeRide) {
            continue;
        }

        eligibleDrivers.push(driver);
    }

    return eligibleDrivers;
}