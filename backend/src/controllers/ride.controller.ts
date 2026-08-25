import { Request, Response } from "express";
import { createRideSchema } from "../zodSchemas/ride.schema.js"; 
import asyncTryCatchHandler from "../middlewares/TryCatch.js";
import { AuthenticatedRequest } from "../middlewares/auth.middleware.js";
import { DriverModel } from "../models/driver.model.js";

import * as RideService from "../services/ride.service.js";

export const createRide = asyncTryCatchHandler(
    async (
        request: AuthenticatedRequest,
        response: Response
    ) => {

        const validated =
            createRideSchema.safeParse(request.body);

        if (!validated.success) {
            return response.status(400).json({
                errors: validated.error.flatten().fieldErrors,
            });
        }

        const riderId = request.userId;

        if (!riderId) {
            return response.status(401).json({
                message: "Unauthorized",
            });
        }

        const {
            pickup,
            destination,
            fare,
            distance,
            duration,
            vehicleType
        } = validated.data;

        const ride =
            await RideService.createRide({
                riderId,

                pickup,

                destination,

                estimatedFare:
                    fare.estimated,

                estimatedDistance:
                    distance.estimated,

                estimatedDuration:
                    duration.estimated,
            },
            vehicleType
        );

        return response.status(201).json({
            message:
                "Ride request created successfully.",
            ride,
        });

    }
);
export const getRideById = asyncTryCatchHandler(
    async (
        request: AuthenticatedRequest,
        response: Response
    ) => {

        const userId = request.userId;

        if (!userId) {
            return response.status(401).json({
                message: "Unauthorized",
            });
        }

        const { rideId } = request.params;

        if (!rideId) {
            return response.status(400).json({
                message: "Ride ID is required.",
            });
        }

        const ride = await RideService.getRideById({
            rideId,
        });

        return response.status(200).json({
            message: "Ride fetched successfully.",
            ride,
        });

    }
);

export const previewRideFare = asyncTryCatchHandler(
    async (
        request: AuthenticatedRequest,
        response: Response
    ) => {

        const userId = request.userId;

        if (!userId) {
            return response.status(401).json({
                message: "Unauthorized",
            });
        }

        const { rideId } = request.params;

        if (!rideId) {
            return response.status(400).json({
                message: "Ride ID is required.",
            });
        }

        const ride = await RideService.previewRideFare({
            rideId,
            userId,
        });

        return response.status(200).json({
            message: "Ride fare preview generated successfully.",
            ride,
        });

    }
);

export const getCurrentRide = asyncTryCatchHandler(
    async (
        request: AuthenticatedRequest,
        response: Response
    ) => {

        const riderId = request.userId;

        if (!riderId) {
            return response.status(401).json({
                message: "Unauthorized",
            });
        }

        const ride = await RideService.getRiderCurrentRide({
            riderId,
        });

        if (!ride) {
            return response.status(404).json({
                message: "You do not have any active ride.",
            });
        }

        return response.status(200).json({
            message: "Current ride fetched successfully.",
            ride,
        });

    }
);

export const getRidesHistory = asyncTryCatchHandler(
    async (
        request: AuthenticatedRequest,
        response: Response
    ) => {

        const riderId = request.userId;

        if (!riderId) {
            return response.status(401).json({
                message: "Unauthorized",
            });
        }

        const rides =
            await RideService.getRiderRideHistory({
                riderId,
            });

        return response.status(200).json({
            message: "Ride history fetched successfully.",
            totalRides: rides.length,
            rides,
        });

    }
);

export const cancelRide = asyncTryCatchHandler(
    async (
        request: AuthenticatedRequest,
        response: Response
    ) => {

        if(!request.params.rideId){
            return response.status(404).json(
                {
                    message : "Please Provide a Ride Id"
                }
            )
        }

        const riderId = request.userId;

        if (!riderId) {
            return response.status(401).json({
                message: "Unauthorized",
            });
        }

        const { rideId } = request.params;

        const { cancellationReason } = request.body;

        const ride = await RideService.cancelRide({
            rideId,
            userId : riderId,
            reason: cancellationReason,
        });

        return response.status(200).json({
            message: "Ride cancelled successfully.",
            ride,
        });

    }
);

export const cancelRideByDriver = asyncTryCatchHandler(
    async (
        request: AuthenticatedRequest,
        response: Response
    ) => {

        if(!request.params.rideId){
            return response.status(404).json(
                {
                    message : "Please Provide a Ride Id"
                }
            )
        }

        const userId = request.userId;

        if (!userId) {
            return response.status(401).json({
                message: "Unauthorized",
            });
        }

        const driver = await DriverModel.findOne({
            user: userId,
            verificationStatus: "APPROVED",
        });

        if (!driver) {
            return response.status(404).json({
                message: "Driver not found.",
            });
        }

        const ride = await RideService.cancelRideByDriver({
            rideId: request.params.rideId,
            driverId: driver.id,
            reason: request.body.cancellationReason,
        });

        return response.status(200).json({
            message: "Ride cancelled successfully.",
            ride,
        });

    }
);


export const getCurrentRideOfDriver = asyncTryCatchHandler(
    async (
        request: AuthenticatedRequest,
        response: Response
    ) => {

        const userId = request.userId;

        if (!userId) {
            return response.status(401).json({
                message: "Unauthorized",
            });
        }

        const driver = await DriverModel.findOne({
            user: userId,
        });

        if (!driver) {
            return response.status(404).json({
                message: "Driver not found.",
            });
        }

        const ride = await RideService.getDriverCurrentRide({
            driverId: driver.id,
        });

        if (!ride) {
            return response.status(404).json({
                message: "No active ride found.",
            });
        }

        return response.status(200).json({
            message: "Current ride fetched successfully.",
            ride,
        });

    }
);


export const acceptRide = asyncTryCatchHandler(
    async (
        request: AuthenticatedRequest,
        response: Response
    ) => {

        if(!request.params.rideId){
            return response.status(404).json(
                {
                    message : "Please Provide a Ride Id"
                }
            )
        }

        const userId = request.userId;

        if (!userId) {
            return response.status(401).json({
                message: "Unauthorized",
            });
        }

        const driver = await DriverModel.findOne({
            user: userId,
            verificationStatus: "APPROVED",
        });

        if (!driver) {
            return response.status(403).json({
                message: "Driver not found or not approved.",
            });
        }

        const ride = await RideService.acceptRide({
            rideId: request.params.rideId,
            driverId: driver.id,
        });

        return response.status(200).json({
            message: "Ride accepted successfully.",
            ride,
        });

    }
);

export const arriveRide = asyncTryCatchHandler(
    async (
        request: AuthenticatedRequest,
        response: Response
    ) => {
                if(!request.params.rideId){
            return response.status(404).json(
                {
                    message : "Please Provide a Ride Id"
                }
            )
        }

        const userId = request.userId;

        if (!userId) {
            return response.status(401).json({
                message: "Unauthorized",
            });
        }

        const driver = await DriverModel.findOne({
            user: userId,
            verificationStatus: "APPROVED",
        });

        if (!driver) {
            return response.status(404).json({
                message: "Driver not found.",
            });
        }

        const ride = await RideService.arriveAtPickup({
            rideId: request.params.rideId,
            driverId: driver.id,
        });

        return response.status(200).json({
            message: "Driver has arrived at the pickup location.",
            ride,
        });

    }
);

export const startRide = asyncTryCatchHandler(
    async (
        request: AuthenticatedRequest,
        response: Response
    ) => {
        if(!request.params.rideId){
            return response.status(404).json(
                {
                    message : "Please Provide a Ride Id"
                }
            )
        }

        const userId = request.userId;

        if (!userId) {
            return response.status(401).json({
                message: "Unauthorized",
            });
        }

        const driver = await DriverModel.findOne({
            user: userId,
            verificationStatus: "APPROVED",
        });

        if (!driver) {
            return response.status(404).json({
                message: "Driver not found.",
            });
        }

        const ride = await RideService.startRide({
            rideId: request.params.rideId,
            driverId: driver.id,
        });

        return response.status(200).json({
            message: "Ride started successfully.",
            ride,
        });

    }
);

export const completeRide = asyncTryCatchHandler(
    async (
        request: AuthenticatedRequest,
        response: Response
    ) => {
                if(!request.params.rideId){
            return response.status(404).json(
                {
                    message : "Please Provide a Ride Id"
                }
            )
        }

        const userId = request.userId;

        if (!userId) {
            return response.status(401).json({
                message: "Unauthorized",
            });
        }

        const driver = await DriverModel.findOne({
            user: userId,
            verificationStatus: "APPROVED",
        });

        if (!driver) {
            return response.status(404).json({
                message: "Driver not found.",
            });
        }

        const ride = await RideService.completeRide({
            rideId: request.params.rideId,
            driverId: driver.id,
        });

        return response.status(200).json({
            message: "Ride completed successfully.",
            ride,
        });

    }
);

export const getDriverRideHistory = asyncTryCatchHandler(
    async (
        request: AuthenticatedRequest,
        response: Response
    ) => {

        const userId = request.userId;

        if (!userId) {
            return response.status(401).json({
                message: "Unauthorized",
            });
        }

        const driver = await DriverModel.findOne({
            user: userId,
            verificationStatus: "APPROVED",
        });

        if (!driver) {
            return response.status(404).json({
                message: "Driver not found.",
            });
        }

        const rides = await RideService.getDriverRideHistory({
            driverId: driver.id,
        });

        return response.status(200).json({
            message: "Driver ride history fetched successfully.",
            totalRides: rides.length,
            rides,
        });

    }
);