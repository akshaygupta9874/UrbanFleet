import { prisma } from "../db/client.js";
import { RideStatus } from "@prisma/client";
import { getRiderId, type IRide } from "./ride.service.js";

import type { NearbyDriver } from "../redis/types.js";
import { findEligibleDrivers } from "./matching.service.js";

import { emitNewRideRequest } from "../sockets/emitters/driver.emitter.js";
import { emitNoDriversAvailable } from "../sockets/emitters/rider.emitter.js";

import { socketRegistry } from "../sockets/registry/socket.registry.js";

// ======================================================
// Constants
// ======================================================

const DISPATCH_BATCH_SIZE = 3;

const DISPATCH_TIMEOUT_MS = 1000000;

// ======================================================
// Types
// ======================================================

interface ActiveDispatch {
    ride: IRide;
    drivers: NearbyDriver[];
    currentIndex: number;
    vehicleType?: string;
    timeout?: NodeJS.Timeout;
}

// ======================================================
// In-memory State
// ======================================================

const activeDispatches = new Map<
    string,
    ActiveDispatch
>();

// ======================================================
// Public Methods
// ======================================================

export async function dispatchRide(
    ride: IRide,
    vehicleType?: string
): Promise<void> {

    // Resolve vehicle type from parameter, ride property, or default fallback
    const resolvedVehicleType =
        vehicleType || (ride as any).vehicleType;

    //--------------------------------------------------
    // Find Nearby Drivers
    //--------------------------------------------------

    const drivers = await findEligibleDrivers(
        ride.pickup.coordinates.latitude,
        ride.pickup.coordinates.longitude
    );

    console.log("All nearby drivers found:", drivers);

    //--------------------------------------------------
    // No Nearby Drivers
    //--------------------------------------------------

    if (drivers.length === 0) {

        emitNoDriversAvailable(
            getRiderId(ride),
            {
                rideId: ride._id.toString(),
            }
        );

        return;
    }

    //--------------------------------------------------
    // Fetch Vehicle Types From MongoDB
    //--------------------------------------------------

    const driverIds = drivers.map(
        driver => driver.driverId
    );

    const dbDrivers = await prisma.driver.findMany({
        where: {
            id: { in: driverIds }
        },
        include: {
            vehicle: {
                select: { type: true }
            }
        }
    });

    const vehicleMap = new Map(
        dbDrivers.map(driver => [
            driver.id,
            driver.vehicle?.type ? driver.vehicle.type.toLowerCase() : ""
        ])
    );

    console.log("Vehicle Map:", vehicleMap);

    //--------------------------------------------------
    // Filter Drivers By Vehicle Type
    //--------------------------------------------------

    const filteredDrivers = drivers.filter(driver => {

        if (!resolvedVehicleType) {
            return true;
        }

        const driverVehicleType =
            vehicleMap.get(driver.driverId);

        console.log(
            `Driver ${driver.driverId}: ${driverVehicleType}`
        );

        return (
            driverVehicleType ===
            resolvedVehicleType.toLowerCase()
        );

    });

    console.log(
        `Filtered drivers matching [${resolvedVehicleType}]:`,
        filteredDrivers
    );

    //--------------------------------------------------
    // No Matching Drivers
    //--------------------------------------------------

    if (filteredDrivers.length === 0) {

        emitNoDriversAvailable(
            getRiderId(ride),
            {
                rideId: ride._id.toString(),
            }
        );

        return;
    }

    //--------------------------------------------------
    // Prevent Duplicate Dispatch
    //--------------------------------------------------

    if (
        activeDispatches.has(
            ride._id.toString()
        )
    ) {
        return;
    }

    //--------------------------------------------------
    // Store Dispatch
    //--------------------------------------------------

    const dispatch: ActiveDispatch = {
        ride,
        drivers: filteredDrivers,
        currentIndex: 0,
        vehicleType: resolvedVehicleType,
    };

    activeDispatches.set(
        ride._id.toString(),
        dispatch
    );

    //--------------------------------------------------
    // Start Dispatch
    //--------------------------------------------------

    await dispatchNextBatch(
        dispatch
    );

}

// ======================================================
// Private Methods
// ======================================================

async function dispatchNextBatch(
    dispatch: ActiveDispatch
): Promise<void> {

    //--------------------------------------------------
    // No More Drivers
    //--------------------------------------------------

    if (
        dispatch.currentIndex >=
        dispatch.drivers.length
    ) {

        notifyNoDriversAvailable(dispatch);

        cleanupDispatch(dispatch.ride._id.toString());

        return;

    }

    //--------------------------------------------------
    // Select Current Batch
    //--------------------------------------------------

    const batch = dispatch.drivers.slice(
        dispatch.currentIndex,
        dispatch.currentIndex +
        DISPATCH_BATCH_SIZE
    );

    //--------------------------------------------------
    // Notify Drivers
    //--------------------------------------------------

    const notifiedCount = notifyDrivers(
        dispatch,
        batch
    );

    //--------------------------------------------------
    // Advance Cursor
    //--------------------------------------------------

    dispatch.currentIndex +=
        DISPATCH_BATCH_SIZE;

    //--------------------------------------------------
    // Nobody was online
    //--------------------------------------------------

    if (notifiedCount === 0) {

        await dispatchNextBatch(
            dispatch
        );

        return;

    }

    //--------------------------------------------------
    // Clear Existing Timeout
    //--------------------------------------------------

    if (dispatch.timeout) {

        clearTimeout(
            dispatch.timeout
        );

    }

    //--------------------------------------------------
    // Wait For Acceptance
    //--------------------------------------------------

    dispatch.timeout = setTimeout(() => {

        void handleDispatchTimeout(
            dispatch.ride._id.toString()
        );

    }, DISPATCH_TIMEOUT_MS);

}

function notifyDrivers(
    dispatch: ActiveDispatch,
    batch: NearbyDriver[]
): number {

    let notified = 0;

    for (const driver of batch) {

        //--------------------------------------------------
        // Driver Online?
        //--------------------------------------------------

        if (
            !socketRegistry.isDriverOnline(
                driver.driverId
            )
        ) {
            continue;
        }

        //--------------------------------------------------
        // Emit Ride Request
        //--------------------------------------------------

        emitNewRideRequest(
            driver.driverId,
            {
                ride: dispatch.ride
            }
        );

        notified++;

    }

    return notified;

}

async function isRideAccepted(
    rideId: string
): Promise<boolean> {

    const ride = await prisma.ride.findUnique({
        where: { id: rideId },
        select: { status: true }
    });

    if (!ride) {
        return true;
    }

    return (
        ride.status !==
        RideStatus.SEARCHING
    );

}

async function handleDispatchTimeout(
    rideId: string
): Promise<void> {

    //--------------------------------------------------
    // Dispatch Still Active?
    //--------------------------------------------------

    const dispatch =
        activeDispatches.get(rideId);

    if (!dispatch) {
        return;
    }

    //--------------------------------------------------
    // Ride Accepted?
    //--------------------------------------------------

    const accepted =
        await isRideAccepted(
            rideId
        );

    if (accepted) {

        cleanupDispatch(
            rideId
        );

        return;

    }

    //--------------------------------------------------
    // Dispatch Next Batch
    //--------------------------------------------------

    await dispatchNextBatch(
        dispatch
    );

}

function notifyNoDriversAvailable(
    dispatch: ActiveDispatch
): void {

    emitNoDriversAvailable(
        getRiderId(dispatch.ride),
        {
            rideId:
                dispatch.ride._id.toString(),
        }
    );

}

function cleanupDispatch(
    rideId: string
): void {

    const dispatch =
        activeDispatches.get(
            rideId
        );

    if (!dispatch) {
        return;
    }

    if (dispatch.timeout) {

        clearTimeout(
            dispatch.timeout
        );

        dispatch.timeout =
            undefined;

    }

    activeDispatches.delete(
        rideId
    );

}

export function stopDispatch(
    rideId: string
): void {

    cleanupDispatch(
        rideId
    );

}

export function isDispatchActive(
    rideId: string
): boolean {

    return activeDispatches.has(
        rideId
    );

}