import { AuthenticatedSocket } from "../types.js";
import { SocketMessageSchema } from "../validators/socket.validator.js"
import { DriverEvents } from "../event.constants.js";
import { UpdateDriverLocationSchema, DriverHeartbeatSchema, DriverAvailabilitySchema, RideActionSchema, RideCancelSchema } from "../validators/driver.validator.js";
import { updateDriverLocation } from "../../redis/services/geo.service.js";
import { sendSocketError } from "../utils/send-error.js";
import { getDriverCurrentRide } from "../../services/ride.service.js";
import { emitDriverLocation } from "../emitters/rider.emitter.js";
import { RideStatus } from "@prisma/client";
import {
    setDriverOnline, setDriverOffline, setDriverAvailable, setDriverBusy, updateDriverHeartbeat
} from "../../redis/services/driver-presence.service.js";
import * as RideService from "../../services/ride.service.js";
export type DriverEventHandler = (
    socket: AuthenticatedSocket,
    data: unknown
) => Promise<void>;

const handlers: Record<string, DriverEventHandler> = {
      [DriverEvents.GO_ONLINE]: handleGoOnline,
    [DriverEvents.GO_OFFLINE]: handleGoOffline,
    [DriverEvents.UPDATE_LOCATION]: handleUpdateLocation,

    [DriverEvents.HEARTBEAT]: handleHeartbeat,

    [DriverEvents.SET_AVAILABLE]: handleSetAvailability,

    [DriverEvents.SET_BUSY]: handleSetBusy,

    [DriverEvents.ACCEPT_RIDE]: handleAcceptRide,

    [DriverEvents.ARRIVED_AT_PICKUP]: handleArrived,

    [DriverEvents.ARRIVED_AT_DESTINATION]: handleArrivedAtDestination,

    [DriverEvents.START_RIDE]: handleStartRide,

    [DriverEvents.COMPLETE_RIDE]: handleCompleteRide,

    [DriverEvents.CANCEL_RIDE_BY_DRIVER]: handleCancelRideByDriver,
};

async function handleGoOnline(
    socket: AuthenticatedSocket,
    data: unknown
) {
    const driverId = socket.user.driverId;

    if (!driverId) {
        sendSocketError(socket, "Driver profile not found.");
        return;
    }

    await setDriverOnline(driverId);

}

async function handleGoOffline(
    socket: AuthenticatedSocket,
    data: unknown
) {
    const driverId = socket.user.driverId;

    if (!driverId) {
        sendSocketError(socket, "Driver profile not found.");
        return;
    }

    await setDriverOffline(driverId);
}

async function handleUpdateLocation(
    socket: AuthenticatedSocket,
    data: unknown
) {
    const result = UpdateDriverLocationSchema.safeParse(data);

    if (!result.success) {
        sendSocketError(socket, "Invalid location payload.");
        return;
    }
    if (!socket.user.driverId) {
        sendSocketError(socket, "Driver profile not found.");
        return;
    }
    await updateDriverLocation(
        socket.user.driverId,
        result.data.latitude,
        result.data.longitude
    );
    const ride = await getDriverCurrentRide({
        driverId: socket.user.driverId!,
    });

    if (
        !ride ||
        (
            ride.status !== RideStatus.DRIVER_ASSIGNED &&
            ride.status !== RideStatus.DRIVER_ARRIVING &&
            ride.status !== RideStatus.STARTED
        )
    ) {
        return;
    }


    emitDriverLocation(
        ride.rider._id.toString(),
        {
            rideId: ride._id.toString(),
            latitude: result.data.latitude,
            longitude: result.data.longitude,
        }
    );
}

async function handleSetBusy(
    socket: AuthenticatedSocket,
    data: unknown
) {
    const driverId = socket.user.driverId;

    if (!driverId) {
        sendSocketError(socket, "Driver profile not found.");
        return;
    }

    await setDriverBusy(driverId);
}

async function handleHeartbeat(
    socket: AuthenticatedSocket,
    data: unknown
) {
    const result = DriverHeartbeatSchema.safeParse(data);

    if (!result.success) {
        sendSocketError(socket, "Invalid heartbeat payload.");
        return;
    }
    if (socket.user.driverId) await updateDriverHeartbeat(socket.user.driverId);
}

async function handleSetAvailability(
    socket: AuthenticatedSocket,
    data: unknown
) {
    const result = DriverAvailabilitySchema.safeParse(data);

    if (!result.success) {
        sendSocketError(socket, "Invalid availability payload.");
        return;
    }

    const driverId = socket.user.driverId;

    if (!driverId) {
        sendSocketError(socket, "Driver profile not found.");
        return;
    }

    if (result.data.available) {

        await setDriverAvailable(driverId);

    } else {

        await setDriverBusy(driverId);

    }

}

async function handleAcceptRide(
    socket: AuthenticatedSocket,
    data: unknown
) {
    const result = RideActionSchema.safeParse(data);

    if (!result.success) {
        sendSocketError(socket, "Invalid ride payload.");
        return;
    }

    if (socket.user.driverId) {
        await RideService.acceptRide({
            rideId: result.data.rideId,
            driverId: socket.user.driverId,
        });
    }
}

async function handleArrived(
    socket: AuthenticatedSocket,
    data: unknown
) {
    const result = RideActionSchema.safeParse(data);

    if (!result.success) {
        sendSocketError(socket, "Invalid ride payload.");
        return;
    }

    if (socket.user.driverId) {
        await RideService.arriveAtPickup({
            rideId: result.data.rideId,
            driverId: socket.user.driverId,
        });
    }
}

async function handleArrivedAtDestination(
    socket: AuthenticatedSocket,
    data: unknown
) {
    const result = RideActionSchema.safeParse(data);

    if (!result.success) {
        sendSocketError(socket, "Invalid ride payload.");
        return;
    }

    if (socket.user.driverId) {
        await RideService.arriveAtDestination({
            rideId: result.data.rideId,
            driverId: socket.user.driverId,
        });
    }
}

async function handleStartRide(
    socket: AuthenticatedSocket,
    data: unknown
) {
    const result = RideActionSchema.safeParse(data);

    if (!result.success) {
        sendSocketError(socket, "Invalid ride payload.");
        return;
    }
    if (socket.user.driverId) {
        await RideService.startRide({
            rideId: result.data.rideId,
            driverId: socket.user.driverId,
        });
    }
}

async function handleCompleteRide(
    socket: AuthenticatedSocket,
    data: unknown
) {
    const result = RideActionSchema.safeParse(data);

    if (!result.success) {
        sendSocketError(socket, "Invalid ride payload.");
        return;
    }
    if (socket.user.driverId) {
        await RideService.completeRide({
            rideId: result.data.rideId,
            driverId: socket.user.driverId,
        });
    }
}

async function handleCancelRideByDriver(
    socket: AuthenticatedSocket,
    data: unknown
) {
    const result = RideCancelSchema.safeParse(data);

    if (!result.success) {
        sendSocketError(socket, "Invalid ride payload.");
        return;
    }

    if (socket.user.driverId) {
        await RideService.cancelRideByDriver({
            rideId: result.data.rideId,
            driverId: socket.user.driverId,
            reason: result.data.reason
        });
    }
}

export async function handleDriverEvent(
    socket: AuthenticatedSocket,
    event: string,
    data: unknown
) {

    const handler = handlers[event];

    if (!handler) {
        sendSocketError(socket, "Unknown driver event.");
        return;
    }

    await handler(socket, data);
}