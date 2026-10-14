import { Request, Response } from "express";
import asyncHandler from "../middlewares/asyncHandler.js";
import { AuthenticatedRequest } from "../middlewares/auth.middleware.js";
import { driverRegistrationSchema } from "../zodSchemas/driver.schema.js";
import { prisma } from "../db/client.js";
import cloudinaryService from "../services/cloudinary.service.js";


export const CloudinaryFolders = {
    DRIVER_PROFILE: "drivers/profile",

    DRIVER_VEHICLE: "drivers/vehicle",

    DRIVER_LICENSE: "drivers/license",

    DRIVER_RC: "drivers/registration",

    DRIVER_INSURANCE: "drivers/insurance",

    DRIVER_PUC: "drivers/pollution",
} as const;

interface DriverUploadFiles {
    profilePhoto?: Express.Multer.File[];
    vehicleFront?: Express.Multer.File[];
    vehicleBack?: Express.Multer.File[];
    vehicleLeft?: Express.Multer.File[];
    vehicleRight?: Express.Multer.File[];
    vehicleInterior?: Express.Multer.File[];
    licenseFront?: Express.Multer.File[];
    licenseBack?: Express.Multer.File[];
    insurance?: Express.Multer.File[];
    registrationCertificate?: Express.Multer.File[];
    pollutionCertificate?: Express.Multer.File[];
}



export const driverRegistrationController = asyncHandler(
    async (request: AuthenticatedRequest, response: Response) => {
        const files = request.files as DriverUploadFiles;

        const userId = request.userId;

        const body = {
            userId: request.body.userId,
            vehicle: request.body.vehicle
                ? JSON.parse(request.body.vehicle)
                : undefined,
            documents: request.body.documents
                ? JSON.parse(request.body.documents)
                : undefined,
        };
        const validationResult =
            driverRegistrationSchema.safeParse(body);

        if (!validationResult.success) {
            return response.status(400).json({
                success: false,
                message: "Invalid input data",
                errors: validationResult.error.issues,
            });
        }

        const { vehicle, documents } = validationResult.data;

        if (validationResult.data.userId !== userId) {
            return response.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        const existingDriver = await prisma.driver.findUnique({
            where: {
                userId: userId,
            },
        });

        if (existingDriver?.isVerified) {
            return response.status(400).json({
                success: false,
                message:
                    "Driver profile already exists and is verified.",
            });
        }

        if (existingDriver && !existingDriver.isVerified) {
            return response.status(400).json({
                success: false,
                message:
                    "Driver application already exists.",
                verificationStatus:
                    existingDriver.verificationStatus,
            });
        }

        const profilePhoto = files.profilePhoto?.[0];

        const vehicleFront = files.vehicleFront?.[0];
        const vehicleBack = files.vehicleBack?.[0];
        const vehicleLeft = files.vehicleLeft?.[0];
        const vehicleRight = files.vehicleRight?.[0];
        const vehicleInterior = files.vehicleInterior?.[0];

        const licenseFront = files.licenseFront?.[0];
        const licenseBack = files.licenseBack?.[0];

        const registrationCertificate =
            files.registrationCertificate?.[0];

        const insurance = files.insurance?.[0];

        const pollutionCertificate =
            files.pollutionCertificate?.[0];

        if (
            !profilePhoto ||
            !vehicleFront ||
            !vehicleBack ||
            !vehicleLeft ||
            !vehicleRight ||
            !vehicleInterior ||
            !licenseFront ||
            !licenseBack ||
            !registrationCertificate ||
            !insurance ||
            !pollutionCertificate
        ) {
            return response.status(400).json({
                success: false,
                message:
                    "Please upload all required driver documents and vehicle images.",
            });
        }

        const uploadedPublicIds: string[] = [];

        const rollbackUploads = async () => {
            if (uploadedPublicIds.length === 0) return;

            try {
                await cloudinaryService.deleteImages(
                    uploadedPublicIds
                );
            } catch (error) {
                console.error(
                    "Failed to rollback uploaded images",
                    error
                );
            }
        };

        try {
            const [
                uploadedProfilePhoto,

                uploadedVehicleFront,
                uploadedVehicleBack,
                uploadedVehicleLeft,
                uploadedVehicleRight,
                uploadedVehicleInterior,

                uploadedLicenseFront,
                uploadedLicenseBack,

                uploadedRegistrationCertificate,

                uploadedInsurance,

                uploadedPollutionCertificate,
            ] = await Promise.all([
                cloudinaryService.uploadImage(
                    profilePhoto,
                    CloudinaryFolders.DRIVER_PROFILE
                ),

                cloudinaryService.uploadImage(
                    vehicleFront,
                    CloudinaryFolders.DRIVER_VEHICLE
                ),

                cloudinaryService.uploadImage(
                    vehicleBack,
                    CloudinaryFolders.DRIVER_VEHICLE
                ),

                cloudinaryService.uploadImage(
                    vehicleLeft,
                    CloudinaryFolders.DRIVER_VEHICLE
                ),

                cloudinaryService.uploadImage(
                    vehicleRight,
                    CloudinaryFolders.DRIVER_VEHICLE
                ),

                cloudinaryService.uploadImage(
                    vehicleInterior,
                    CloudinaryFolders.DRIVER_VEHICLE
                ),

                cloudinaryService.uploadImage(
                    licenseFront,
                    CloudinaryFolders.DRIVER_LICENSE
                ),

                cloudinaryService.uploadImage(
                    licenseBack,
                    CloudinaryFolders.DRIVER_LICENSE
                ),

                cloudinaryService.uploadImage(
                    registrationCertificate,
                    CloudinaryFolders.DRIVER_RC
                ),

                cloudinaryService.uploadImage(
                    insurance,
                    CloudinaryFolders.DRIVER_INSURANCE
                ),

                cloudinaryService.uploadImage(
                    pollutionCertificate,
                    CloudinaryFolders.DRIVER_PUC
                ),
            ]);

            uploadedPublicIds.push(
                uploadedProfilePhoto.publicId,

                uploadedVehicleFront.publicId,
                uploadedVehicleBack.publicId,
                uploadedVehicleLeft.publicId,
                uploadedVehicleRight.publicId,
                uploadedVehicleInterior.publicId,

                uploadedLicenseFront.publicId,
                uploadedLicenseBack.publicId,

                uploadedRegistrationCertificate.publicId,

                uploadedInsurance.publicId,

                uploadedPollutionCertificate.publicId
            );

            const profilePhotoData = {
                url: uploadedProfilePhoto.url,
                publicId: uploadedProfilePhoto.publicId,
            };

            const vehicleImages = {
                front: uploadedVehicleFront.url,
                back: uploadedVehicleBack.url,
                left: uploadedVehicleLeft.url,
                right: uploadedVehicleRight.url,
                interior: uploadedVehicleInterior.url,
            };

            const driverDocuments = {
                drivingLicense: {
                    number: documents.drivingLicense.number,
                    expiryDate: documents.drivingLicense.expiryDate,
                    frontImage: uploadedLicenseFront.url,
                    backImage: uploadedLicenseBack.url,
                    verified: false,
                },

                registrationCertificate: {
                    number: documents.registrationCertificate.number,
                    image: uploadedRegistrationCertificate.url,
                    verified: false,
                },

                insurance: {
                    number: documents.insurance.number,
                    expiryDate: documents.insurance.expiryDate,
                    image: uploadedInsurance.url,
                    verified: false,
                },

                pollutionCertificate: {
                    expiryDate:
                        documents.pollutionCertificate.expiryDate,
                    image: uploadedPollutionCertificate.url,
                },
            };
            const newDriver = await prisma.driver.create({
                data: {
                    userId: userId!,
                    profilePhoto: profilePhotoData,
                    vehicle: {
                        create: {
                            type: vehicle.type,
                            brand: vehicle.brand,
                            model: vehicle.model,
                            color: vehicle.color,
                            registrationNumber: vehicle.registrationNumber,
                            registrationYear: vehicle.registrationYear,
                            images: vehicleImages,
                        },
                    },
                    documents: {
                        create: [
                            {
                                type: "DRIVING_LICENSE",
                                number: documents.drivingLicense.number,
                                expiryDate: documents.drivingLicense.expiryDate,
                                frontImage: uploadedLicenseFront.url,
                                backImage: uploadedLicenseBack.url,
                                isVerified: false,
                            },
                            {
                                type: "REGISTRATION_CERTIFICATE",
                                number: documents.registrationCertificate.number,
                                frontImage: uploadedRegistrationCertificate.url,
                                isVerified: false,
                            },
                            {
                                type: "INSURANCE",
                                number: documents.insurance.number,
                                expiryDate: documents.insurance.expiryDate,
                                frontImage: uploadedInsurance.url,
                                isVerified: false,
                            },
                            {
                                type: "POLLUTION",
                                number: "PUC",
                                expiryDate: documents.pollutionCertificate.expiryDate,
                                frontImage: uploadedPollutionCertificate.url,
                                isVerified: false,
                            },
                        ],
                    },
                },
            });

            return response.status(201).json({
                success: true,
                message:
                    "Driver profile created successfully. Awaiting verification.",
                data: {
                    id: newDriver.id,
                    _id: newDriver.id,
                    verificationStatus:
                        newDriver.verificationStatus,
                },
            });
        } catch (error: any) {
            await rollbackUploads();

            if (error.code === "P2002" || error.code === 11000) {
                const target = error.meta?.target;
                const duplicateField = Array.isArray(target) ? target.join(",") : Object.keys(error.keyPattern ?? {})[0] ?? "";

                let message = "Duplicate data found.";

                if (duplicateField.includes("user")) {
                    message =
                        "Driver profile already exists.";
                } else if (duplicateField.includes("registration_number") || duplicateField.includes("registrationNumber")) {
                    message =
                        "Vehicle registration number is already registered.";
                } else {
                    message =
                        "Duplicate data found. Please verify your details.";
                }

                return response.status(409).json({
                    success: false,
                    message,
                });
            }

            throw error;
        }
    }
);

export const driverProfileController = asyncHandler(
    async (request: Request, response: Response) => {
        const authRequest = request as AuthenticatedRequest;
        const userId = authRequest.userId;
        const driverProfile = await prisma.driver.findUnique({
            where: { userId },
            include: {
                user: true,
                vehicle: true,
                documents: true,
            },
        });
        if (!driverProfile) {
            return response.status(404).json(
                {
                    message: "You have not Registered for the Driver Role till now "
                }
            )
        }

        const docMap: Record<string, any> = {};
        for (const doc of driverProfile.documents || []) {
            if (doc.type === "DRIVING_LICENSE") {
                docMap.drivingLicense = {
                    number: doc.number || "",
                    expiryDate: doc.expiryDate ? doc.expiryDate.toISOString() : "",
                    frontImage: doc.frontImage || "",
                    backImage: doc.backImage || "",
                    verified: doc.isVerified ?? false,
                };
            } else if (doc.type === "REGISTRATION_CERTIFICATE") {
                docMap.registrationCertificate = {
                    number: doc.number || "",
                    image: doc.frontImage || "",
                    verified: doc.isVerified ?? false,
                };
            } else if (doc.type === "INSURANCE") {
                docMap.insurance = {
                    number: doc.number || "",
                    expiryDate: doc.expiryDate ? doc.expiryDate.toISOString() : "",
                    image: doc.frontImage || "",
                    verified: doc.isVerified ?? false,
                };
            } else if (doc.type === "POLLUTION") {
                docMap.pollutionCertificate = {
                    expiryDate: doc.expiryDate ? doc.expiryDate.toISOString() : "",
                    image: doc.frontImage || "",
                };
            }
        }

        docMap.drivingLicense = docMap.drivingLicense || { number: "", expiryDate: "", frontImage: "", backImage: "", verified: false };
        docMap.registrationCertificate = docMap.registrationCertificate || { number: "", image: "", verified: false };
        docMap.insurance = docMap.insurance || { number: "", expiryDate: "", image: "", verified: false };
        docMap.pollutionCertificate = docMap.pollutionCertificate || { expiryDate: "", image: "" };

        const statistics = {
            totalTrips: driverProfile.totalTrips ?? 0,
            completedTrips: driverProfile.completedTrips ?? 0,
            cancelledTrips: driverProfile.cancelledTrips ?? 0,
            totalDistance: Number(driverProfile.totalDistanceKm ?? 0),
            totalEarnings: Number(driverProfile.totalEarningsPaise ?? 0),
        };

        const rating = {
            average: Number(driverProfile.averageRating ?? 5.0),
            totalRatings: driverProfile.totalRatings ?? 0,
        };

        const vehicle = driverProfile.vehicle ? {
            type: driverProfile.vehicle.type,
            brand: driverProfile.vehicle.brand,
            model: driverProfile.vehicle.model,
            color: driverProfile.vehicle.color,
            registrationNumber: driverProfile.vehicle.registrationNumber,
            registrationYear: driverProfile.vehicle.registrationYear,
        } : {
            type: "CAR",
            brand: "Toyota",
            model: "Prius",
            color: "Pearl White",
            registrationNumber: "MH-02-UF-2026",
            registrationYear: 2024,
        };

        const userObj = driverProfile.user ? {
            id: driverProfile.user.id,
            _id: driverProfile.user.id,
            firstName: driverProfile.user.firstName,
            lastName: driverProfile.user.lastName,
            email: driverProfile.user.email,
        } : {
            id: userId,
            _id: userId,
            firstName: "",
            lastName: "",
            email: "",
        };

        return response.status(200).json(
            {
                message: "Driver Profile Fetched Successfully",
                data: {
                    ...driverProfile,
                    id: driverProfile.id,
                    _id: driverProfile.id,
                    user: userObj,
                    vehicle,
                    documents: docMap,
                    statistics,
                    rating,
                    totalEarningsPaise: driverProfile.totalEarningsPaise.toString(),
                },
            }
        );
    }
);