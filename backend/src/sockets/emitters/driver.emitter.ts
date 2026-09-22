import { IRide } from "../../models/ride.model.js";
import { ServerEvents } from "../event.constants.js";
import { socketRegistry } from "../registry/socket.registry.js";

interface Coordinates {
    latitude: number;
    longitude: number;
}

export interface NewRideRequestPayload {
    ride : IRide
}

export interface RideCancelledPayload {
    rideId: string;
    cancelledBy: "RIDER" | "DRIVER";
    reason?: string;
}

function emitToDriver<T>(
    driverId: string,
    event: string,
    payload: T
): void {

    const sockets =
        socketRegistry.getDriverSockets(driverId);

    if (!sockets) {
        return;
    }

    const message = JSON.stringify({
        event,
        data: payload,
    });

    for (const socket of sockets) {

        if (socket.readyState !== socket.OPEN) {
            continue;
        }

        socket.send(message);

    }

}

export function emitNewRideRequest(
    driverId: string,
    payload: NewRideRequestPayload
): void {

    emitToDriver(
        driverId,
        ServerEvents.NEW_RIDE,
        payload
    );

}

export function emitRideCancelled(
    driverId: string,
    payload: RideCancelledPayload
): void {

    emitToDriver(
        driverId,
        ServerEvents.RIDE_CANCELLED,
        payload
    );

}

export interface PaymentCapturedPayload {
    ride: IRide;
}

export function emitPaymentCaptured(
    driverId: string,
    payload: PaymentCapturedPayload
): void {

    emitToDriver(
        driverId,
        ServerEvents.PAYMENT_CAPTURED,
        payload
    );

}