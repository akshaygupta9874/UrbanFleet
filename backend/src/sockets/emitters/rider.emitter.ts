// emitRideAccepted()

// emitDriverLocation()

// emitDriverArrived()

// emitRideStarted()

// emitRideCompleted()

// emitRideCancelled()

// emitNoDriversAvailable()

import { socketRegistry } from "../registry/socket.registry.js";
import { ServerEvent, ServerEvents } from "../event.constants.js";
import { IRide } from "../../models/ride.model.js";

interface RideAcceptedPayload {
    ride : IRide;
}

export interface DriverLocationPayload {
    rideId: string;
    latitude: number;
    longitude: number;
}
export interface DriverArrivedPayload {
    rideId: string;
}
export interface RideStartedPayload {
    rideId: string;
}
export interface ArrivedAtDestinationPayload {
    rideId: string;
}
export interface RideCancelledPayload {
    rideId: string;
    cancelledBy: "RIDER" | "DRIVER";
    reason?: string;
}
export interface RideCompletedPayload { 
    rideId: string; 
}
export interface PaymentCapturedPayload {
    ride: IRide;
}
export interface NoDriversAvailablePayload {
    rideId: string;
}


function emitToRider<T>(
    riderId: string,
    event: ServerEvent,
    data: T
): void {

    const sockets =
        socketRegistry.getRiderSockets(riderId);

    if (!sockets) {
        return;
    }

    const message = JSON.stringify({
        event,
        data,
    });

    for (const socket of sockets) {

        if (socket.readyState === socket.OPEN) {
            socket.send(message);
        }

    }

}


export function emitRideAccepted(
    riderId: string,
    payload: RideAcceptedPayload
): void {
    emitToRider(
        riderId,
        ServerEvents.RIDE_ACCEPTED,
        payload
    );
}

export function emitDriverLocation(
    riderId: string,
    payload: DriverLocationPayload
): void {

    emitToRider(
        riderId,
        ServerEvents.DRIVER_LOCATION,
        payload
    );

}

export function emitDriverArrived(
    riderId: string,
    payload: DriverArrivedPayload
): void {

    emitToRider(
        riderId,
        ServerEvents.DRIVER_ARRIVED,
        payload
    );

}

export function emitRideStarted(
    riderId: string,
    payload: RideStartedPayload
): void {

    emitToRider(
        riderId,
        ServerEvents.RIDE_STARTED,
        payload
    );

}

export function emitArrivedAtDestination(
    riderId: string,
    payload: ArrivedAtDestinationPayload
): void {

    emitToRider(
        riderId,
        ServerEvents.ARRIVED_AT_DESTINATION,
        payload
    );

}

export function emitRideCompleted(
    riderId: string,
    payload: RideCompletedPayload
): void {

    emitToRider(
        riderId,
        ServerEvents.RIDE_COMPLETED,
        payload
    );
}

export function emitPaymentCaptured(
    riderId: string,
    payload: PaymentCapturedPayload
): void {
    emitToRider(
        riderId,
        ServerEvents.PAYMENT_CAPTURED,
        payload
    );
}

export function emitRideCancelled(
    riderId: string,
    payload: RideCancelledPayload
): void {

    emitToRider(
        riderId,
        ServerEvents.RIDE_CANCELLED,
        payload
    );

}

export function emitNoDriversAvailable(
    riderId: string,
    payload: NoDriversAvailablePayload
): void {

    emitToRider(
        riderId,
        ServerEvents.RIDE_NO_DRIVERS_AVAILABLE,
        payload
    );

}