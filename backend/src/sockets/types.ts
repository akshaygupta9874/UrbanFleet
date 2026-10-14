import { WebSocket } from "ws";
import { UserRole } from "../models/user.model.js";

export interface AuthenticatedSocketUser {
    userId: string;
    driverId?: string;
    role: UserRole[];
    sessionId: string;
}

export interface AuthenticatedSocket extends WebSocket {
    user: AuthenticatedSocketUser;
}

export interface SocketMessage<T = unknown> {
    event: string;
    data: T;
}

export interface SocketErrorPayload {
    message: string;
    code?: string;
}

export interface DriverLocationPayload {
    latitude: number;
    longitude: number;
}

export interface DriverAvailabilityPayload {
    available: boolean;
}

export interface RideActionPayload {
    rideId: string;
}

export interface HeartbeatPayload {
    timestamp: number;
}

export interface RiderLocationPayload {
    latitude: number;
    longitude: number;
}

export interface RideProgressPayload {
    rideId: string;
}