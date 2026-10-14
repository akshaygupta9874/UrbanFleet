import { setDriverAvailable, setDriverBusy } from "../redis/services/driver-presence.service.js";
import { RideStatus, RidePaymentStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "../db/client.js";
import { fareService } from "./fare.service.js";
import {
    emitRideAccepted,
    emitDriverArrived,
    emitRideStarted,
    emitRideCancelled,
    emitRideCompleted,
    emitArrivedAtDestination
} from "../sockets/emitters/rider.emitter.js";
import { stopDispatch, dispatchRide } from "./dispatch-ride.service.js";
import { AppError } from "../utils/AppError.js";

export { RideStatus, RidePaymentStatus };
export type IRide = any;

export function getRiderId(ride: any): string {
    if (!ride) return "";
    const id = ride.riderId ?? ride.rider_id ?? (typeof ride.rider === "string" ? ride.rider : ride.rider?.id || ride.rider?._id);
    return id ? String(id) : "";
}

export function getDriverId(ride: any): string {
    if (!ride) return "";
    const id = ride.driverId ?? ride.driver_id ?? (typeof ride.driver === "string" ? ride.driver : ride.driver?.id || ride.driver?._id);
    return id ? String(id) : "";
}

// --- Compatibility Formatter ---
export function formatRide(ride: any): any {
    if (!ride) return null;
    const riderId = getRiderId(ride);
    const driverId = getDriverId(ride);

    let riderObj = ride.rider;
    if (riderObj && typeof riderObj === "object") {
        riderObj = {
            ...riderObj,
            id: riderObj.id || riderObj._id,
            _id: riderObj.id || riderObj._id,
        };
    } else {
        riderObj = riderId;
    }

    let driverObj = ride.driver;
    if (driverObj && typeof driverObj === "object") {
        driverObj = {
            ...driverObj,
            id: driverObj.id || driverObj._id,
            _id: driverObj.id || driverObj._id,
            totalEarningsPaise: driverObj.totalEarningsPaise != null ? driverObj.totalEarningsPaise.toString() : "0",
        };
        if (driverObj.user && typeof driverObj.user === "object") {
            driverObj.user = {
                ...driverObj.user,
                id: driverObj.user.id || driverObj.user._id,
                _id: driverObj.user.id || driverObj.user._id,
            };
        }
    } else {
        driverObj = driverId;
    }

    const estimatedFarePaise = ride.estimatedFarePaise ?? ride.estimated_fare_paise ?? ride.fare?.estimated;
    const finalFarePaise = ride.finalFarePaise ?? ride.final_fare_paise ?? ride.fare?.final;
    const fareBreakdown = ride.fareBreakdown ?? ride.fare_breakdown ?? ride.fare?.breakdown;

    const estimatedDistanceMeters = ride.estimatedDistanceMeters ?? ride.estimated_distance_meters ?? ride.distance?.estimated;
    const actualDistanceMeters = ride.actualDistanceMeters ?? ride.actual_distance_meters ?? ride.distance?.actual;

    const estimatedDurationSeconds = ride.estimatedDurationSeconds ?? ride.estimated_duration_seconds ?? ride.duration?.estimated;
    const actualDurationSeconds = ride.actualDurationSeconds ?? ride.actual_duration_seconds ?? ride.duration?.actual;

    const paymentStatus = ride.paymentStatus ?? ride.payment_status;
    const cancelledBy = ride.cancelledBy ?? ride.cancelled_by;
    const cancellationReason = ride.cancellationReason ?? ride.cancellation_reason;
    const startedAt = ride.startedAt ?? ride.started_at;
    const completedAt = ride.completedAt ?? ride.completed_at;
    const cancelledAt = ride.cancelledAt ?? ride.cancelled_at;
    const createdAt = ride.createdAt ?? ride.created_at;
    const updatedAt = ride.updatedAt ?? ride.updated_at;

    return {
        ...ride,
        id: ride.id || ride._id,
        _id: ride.id || ride._id,
        rider: riderObj,
        riderId,
        driver: driverObj,
        driverId,
        status: ride.status,
        paymentStatus,
        cancelledBy,
        cancellationReason,
        startedAt,
        completedAt,
        cancelledAt,
        createdAt,
        updatedAt,
        fare: ride.fare || {
            estimated: estimatedFarePaise,
            final: finalFarePaise,
            breakdown: fareBreakdown,
        },
        estimatedFarePaise,
        finalFarePaise,
        fareBreakdown,
        distance: ride.distance || {
            estimated: estimatedDistanceMeters,
            actual: actualDistanceMeters,
        },
        estimatedDistanceMeters,
        actualDistanceMeters,
        duration: ride.duration || {
            estimated: estimatedDurationSeconds,
            actual: actualDurationSeconds,
        },
        estimatedDurationSeconds,
        actualDurationSeconds,
    };
}

export interface CreateRideInput {
    riderId: string;

    pickup: {
        address: string;
        coordinates: {
            latitude: number;
            longitude: number;
        };
    };

    destination: {
        address: string;
        coordinates: {
            latitude: number;
            longitude: number;
        };
    };

    estimatedFare: number;
    estimatedDistance: number;
    estimatedDuration: number;
}

export interface AcceptRideInput {
    rideId: string;
    driverId: string;
}

export interface ArriveAtPickupInput {
    rideId: string;
    driverId: string;
}

export interface ArriveAtDestinationInput {
    rideId: string;
    driverId: string;
}

export interface StartRideInput {
    rideId: string;
    driverId: string;
}

export interface CancelRideInput {
    rideId: string;
    userId: string;
    reason?: string;
}

export interface CompleteRideInput {
    rideId: string;
    driverId: string;
}

export interface GetRideByIdInput {
    rideId: string;
}

export interface GetDriverCurrentRideInput {
    driverId: string;
}

export interface GetRiderCurrentRideInput {
    riderId: string;
}

export interface GetRiderRideHistoryInput {
    riderId: string;
}

export interface CancelRideByDriverInput {
    rideId: string;
    driverId: string;
    reason?: string;
}

export interface GetDriverRideHistoryInput {
    driverId: string;
}

export async function createRide(
    input: CreateRideInput,
    vehicleType: string
): Promise<any> {
    const estimatedFarePaise = fareService.calculateFareForDistance(
        input.estimatedDistance,
        vehicleType
    ).totalPaise;

    let createdRide: any;
    try {
        createdRide = await prisma.$transaction(async (tx) => {
            const existingRide = await tx.ride.findFirst({
                where: {
                    riderId: input.riderId,
                    status: {
                        notIn: [RideStatus.COMPLETED, RideStatus.CANCELLED],
                    },
                },
            });

            if (existingRide) {
                throw new AppError("Rider already has an active ride.", 409, "RIDE_ACTIVE");
            }

            return await tx.ride.create({
                data: {
                    riderId: input.riderId,
                    pickup: input.pickup,
                    destination: input.destination,
                    estimatedFarePaise,
                    estimatedDistanceMeters: input.estimatedDistance,
                    estimatedDurationSeconds: input.estimatedDuration,
                    status: RideStatus.SEARCHING,
                    paymentStatus: RidePaymentStatus.PENDING,
                },
            });
        });
    } catch (err: any) {
        if (err instanceof AppError) {
            throw err;
        }
        if (err.code === "P2002" || err.message?.includes("idx_rides_one_active_per_rider") || err.code === "23505") {
            throw new AppError("Rider already has an active ride.", 409, "RIDE_ACTIVE");
        }
        throw err;
    }

    const ride = formatRide(createdRide);

    try {
        await dispatchRide(ride, vehicleType);
    } catch (err) {
        console.error("Ride dispatch failed:", err);
    }

    return ride;
}

export async function acceptRide(
    input: AcceptRideInput
): Promise<any> {
    const ride = await prisma.$transaction(async (tx) => {
        // Row-level lock on driver using SELECT ... FOR UPDATE
        const lockedDrivers = await tx.$queryRaw<Array<{
            id: string;
            user_id: string;
            verification_status: string;
        }>>`SELECT id, user_id, verification_status FROM drivers WHERE id = ${input.driverId}::uuid FOR UPDATE`;

        const driver = lockedDrivers[0];
        if (!driver) {
            throw new Error("Driver not found.");
        }

        if (driver.verification_status !== "APPROVED") {
            throw new Error("Driver is not verified.");
        }

        const activeRideForDriver = await tx.ride.findFirst({
            where: {
                driverId: input.driverId,
                status: {
                    in: [
                        RideStatus.DRIVER_ASSIGNED,
                        RideStatus.DRIVER_ARRIVING,
                        RideStatus.STARTED,
                        RideStatus.ARRIVED_AT_DESTINATION,
                    ],
                },
            },
        });

        if (activeRideForDriver) {
            throw new Error("Driver already has an active ride.");
        }

        const updatedRide = await tx.ride.updateMany({
            where: {
                id: input.rideId,
                status: RideStatus.SEARCHING,
            },
            data: {
                status: RideStatus.DRIVER_ASSIGNED,
                driverId: input.driverId,
            },
        });

        if (updatedRide.count === 0) {
            throw new AppError("Ride not found or already accepted.");
        }

        const rideRecord = await tx.ride.findUnique({
            where: { id: input.rideId },
        });

        return formatRide(rideRecord);
    });

    stopDispatch(ride.id);

    await setDriverBusy(input.driverId);

    emitRideAccepted(getRiderId(ride), {
        ride,
    });

    return ride;
}

export async function arriveAtPickup(
    input: ArriveAtPickupInput
): Promise<any> {
    const updated = await prisma.ride.updateMany({
        where: {
            id: input.rideId,
            driverId: input.driverId,
            status: RideStatus.DRIVER_ASSIGNED,
        },
        data: {
            status: RideStatus.DRIVER_ARRIVING,
        },
    });

    if (updated.count === 0) {
        throw new AppError("Ride not found or cannot be marked as arrived.");
    }

    const rideRecord = await prisma.ride.findUnique({
        where: { id: input.rideId },
    });
    const ride = formatRide(rideRecord);

    emitDriverArrived(getRiderId(ride), {
        rideId: ride.id,
    });

    return ride;
}

export function canCompleteRide(
    ride: any
): boolean {
    return (
        ride.status === RideStatus.ARRIVED_AT_DESTINATION &&
        (
            ride.paymentStatus === RidePaymentStatus.CAPTURED ||
            ride.paymentStatus === RidePaymentStatus.PAID
        )
    );
}

export async function startRide(
    input: StartRideInput
): Promise<any> {
    const updated = await prisma.ride.updateMany({
        where: {
            id: input.rideId,
            driverId: input.driverId,
            status: RideStatus.DRIVER_ARRIVING,
        },
        data: {
            status: RideStatus.STARTED,
            startedAt: new Date(),
        },
    });

    if (updated.count === 0) {
        throw new AppError("Ride not found or cannot be started.");
    }

    const rideRecord = await prisma.ride.findUnique({
        where: { id: input.rideId },
    });
    const ride = formatRide(rideRecord);

    emitRideStarted(getRiderId(ride), {
        rideId: ride.id,
    });

    return ride;
}

export async function arriveAtDestination(
    input: ArriveAtDestinationInput
): Promise<any> {
    const updated = await prisma.ride.updateMany({
        where: {
            id: input.rideId,
            driverId: input.driverId,
            status: RideStatus.STARTED,
        },
        data: {
            status: RideStatus.ARRIVED_AT_DESTINATION,
        },
    });

    if (updated.count === 0) {
        throw new AppError("Ride not found or cannot be marked as arrived at destination.");
    }

    const rideRecord = await prisma.ride.findUnique({
        where: { id: input.rideId },
    });
    const ride = formatRide(rideRecord);

    emitArrivedAtDestination(getRiderId(ride), {
        rideId: ride.id,
    });

    return ride;
}

export async function cancelRide(
    input: CancelRideInput
): Promise<any> {
    const ride = await prisma.$transaction(async (tx) => {
        const updated = await tx.ride.updateMany({
            where: {
                id: input.rideId,
                riderId: input.userId,
                status: {
                    in: [
                        RideStatus.SEARCHING,
                        RideStatus.DRIVER_ASSIGNED,
                        RideStatus.DRIVER_ARRIVING,
                    ],
                },
            },
            data: {
                status: RideStatus.CANCELLED,
                cancelledBy: "RIDER",
                cancellationReason: input.reason ?? null,
                cancelledAt: new Date(),
            },
        });

        if (updated.count === 0) {
            throw new Error("Ride not found or cannot be cancelled.");
        }

        const rideRecord = await tx.ride.findUnique({
            where: { id: input.rideId },
        });

        if (rideRecord?.driverId) {
            await tx.driver.update({
                where: { id: rideRecord.driverId },
                data: {
                    cancelledTrips: { increment: 1 },
                },
            });
        }

        return formatRide(rideRecord);
    });

    stopDispatch(ride.id);

    if (ride.driverId) {
        await setDriverAvailable(ride.driverId);

        emitRideCancelled(ride.driverId, {
            rideId: ride.id,
            cancelledBy: "RIDER",
            reason: input.reason,
        });
    }

    return ride;
}

export async function completeRide(
    input: CompleteRideInput
): Promise<any> {
    const ride = await prisma.$transaction(async (tx) => {
        const driver = await tx.driver.findUnique({
            where: { id: input.driverId },
            include: { vehicle: true },
        });

        if (!driver) {
            throw new Error("Driver not found.");
        }

        const rideRecord = await tx.ride.findFirst({
            where: {
                id: input.rideId,
                driverId: driver.id,
                status: RideStatus.ARRIVED_AT_DESTINATION,
            },
        });

        if (!rideRecord) {
            throw new AppError("Ride not found or cannot be completed yet.");
        }

        const rideFormatted = formatRide(rideRecord);

        if (!canCompleteRide(rideFormatted)) {
            throw new AppError(
                "Payment must be completed before the ride can be finalized.",
                409,
                "PAYMENT_REQUIRED"
            );
        }

        const finalFare = fareService.calculateFinalFare(
            rideFormatted,
            driver.vehicle?.type
        );

        const completedRecord = await tx.ride.update({
            where: { id: input.rideId },
            data: {
                status: RideStatus.COMPLETED,
                completedAt: new Date(),
                finalFarePaise: finalFare.totalPaise,
                fareBreakdown: finalFare as any,
            },
        });

        const distanceDeltaKm = Number((rideFormatted.distance.actual ?? rideFormatted.distance.estimated) / 1000);
        const earningsDeltaPaise = BigInt(finalFare.driverEarningPaise ?? rideFormatted.fare.estimated);

        await tx.driver.update({
            where: { id: input.driverId },
            data: {
                totalTrips: { increment: 1 },
                completedTrips: { increment: 1 },
                totalDistanceKm: { increment: distanceDeltaKm },
                totalEarningsPaise: { increment: earningsDeltaPaise },
            },
        });

        return formatRide(completedRecord);
    });

    await setDriverAvailable(input.driverId);

    emitRideCompleted(getRiderId(ride), {
        rideId: ride.id,
    });

    return ride;
}

export async function getRideById(
    input: GetRideByIdInput
): Promise<any> {
    const ride = await prisma.ride.findUnique({
        where: { id: input.rideId },
        include: {
            rider: true,
            driver: {
                include: {
                    user: true,
                    vehicle: true,
                },
            },
        },
    });

    if (!ride) {
        throw new Error("Ride not found.");
    }

    return formatRide(ride);
}

export async function getDriverCurrentRide(
    input: GetDriverCurrentRideInput
): Promise<any | null> {
    const ride = await prisma.ride.findFirst({
        where: {
            driverId: input.driverId,
            status: {
                in: [
                    RideStatus.DRIVER_ASSIGNED,
                    RideStatus.DRIVER_ARRIVING,
                    RideStatus.STARTED,
                    RideStatus.ARRIVED_AT_DESTINATION,
                ],
            },
        },
        include: {
            rider: true,
            driver: {
                include: {
                    user: true,
                    vehicle: true,
                },
            },
        },
    });

    return ride ? formatRide(ride) : null;
}

export async function getRiderCurrentRide(
    input: GetRiderCurrentRideInput
): Promise<any | null> {
    const ride = await prisma.ride.findFirst({
        where: {
            riderId: input.riderId,
            status: {
                notIn: [RideStatus.COMPLETED, RideStatus.CANCELLED],
            },
        },
        include: {
            rider: true,
            driver: {
                include: {
                    user: true,
                    vehicle: true,
                },
            },
        },
    });

    return ride ? formatRide(ride) : null;
}

export async function previewRideFare(
    input: { rideId: string; userId: string }
): Promise<any> {
    const rideRecord = await prisma.ride.findUnique({
        where: { id: input.rideId },
        include: {
            rider: true,
            driver: {
                include: {
                    vehicle: true,
                },
            },
        },
    });

    if (!rideRecord) {
        throw new AppError("Ride not found.", 404, "RIDE_NOT_FOUND");
    }

    const ride = formatRide(rideRecord);

    const riderId = getRiderId(ride);

    if (riderId !== input.userId) {
        throw new AppError("Unauthorized.", 403, "FORBIDDEN");
    }

    if (
        ![
            RideStatus.ARRIVED_AT_DESTINATION,
            RideStatus.COMPLETED,
        ].includes(ride.status)
    ) {
        throw new AppError(
            "Fare preview is only available after the ride reaches the destination.",
            409,
            "INVALID_RIDE_STATUS"
        );
    }

    if (!ride.driver) {
        throw new AppError("Driver is not assigned.", 400, "DRIVER_NOT_ASSIGNED");
    }

    const driver = ride.driver as any;
    const vehicleType = driver.vehicle?.type?.toString?.() || undefined;
    const finalFare = fareService.calculateFinalFare(ride, vehicleType);

    const updated = await prisma.ride.update({
        where: { id: input.rideId },
        data: {
            finalFarePaise: finalFare.totalPaise,
            fareBreakdown: finalFare as any,
        },
        include: {
            rider: true,
            driver: {
                include: {
                    vehicle: true,
                },
            },
        },
    });

    return formatRide(updated);
}

export async function getRiderRideHistory(
    input: GetRiderRideHistoryInput
): Promise<any[]> {
    const rides = await prisma.ride.findMany({
        where: { riderId: input.riderId },
        orderBy: { createdAt: "desc" },
        include: {
            driver: {
                include: {
                    user: true,
                    vehicle: true,
                },
            },
        },
    });

    return rides.map(formatRide);
}

export async function cancelRideByDriver(
    input: CancelRideByDriverInput
): Promise<any> {
    const ride = await prisma.$transaction(async (tx) => {
        const driver = await tx.driver.findUnique({
            where: { id: input.driverId },
        });

        if (!driver) {
            throw new AppError("Driver not found.");
        }

        const updated = await tx.ride.updateMany({
            where: {
                id: input.rideId,
                driverId: driver.id,
                status: {
                    in: [
                        RideStatus.DRIVER_ASSIGNED,
                        RideStatus.DRIVER_ARRIVING,
                    ],
                },
            },
            data: {
                status: RideStatus.CANCELLED,
                cancelledBy: "DRIVER",
                cancellationReason: input.reason ?? null,
                cancelledAt: new Date(),
            },
        });

        if (updated.count === 0) {
            throw new AppError("Ride not found or cannot be cancelled.");
        }

        await tx.driver.update({
            where: { id: input.driverId },
            data: {
                cancelledTrips: { increment: 1 },
            },
        });

        const rideRecord = await tx.ride.findUnique({
            where: { id: input.rideId },
        });

        return formatRide(rideRecord);
    });

    stopDispatch(ride.id);

    await setDriverAvailable(input.driverId);

    emitRideCancelled(getRiderId(ride), {
        rideId: ride.id,
        cancelledBy: "DRIVER",
        reason: input.reason,
    });

    return ride;
}

export async function getDriverRideHistory(
    input: GetDriverRideHistoryInput
): Promise<any[]> {
    const rides = await prisma.ride.findMany({
        where: {
            driverId: input.driverId,
            status: {
                in: [RideStatus.COMPLETED, RideStatus.CANCELLED],
            },
        },
        orderBy: {
            createdAt: "desc",
        },
        include: {
            rider: true,
        },
    });

    return rides.map(formatRide);
}
