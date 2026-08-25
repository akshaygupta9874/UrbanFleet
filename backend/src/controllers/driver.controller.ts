import { Request, Response } from "express";
import asyncTryCatchHandler from "../middlewares/TryCatch.js";
import { AuthenticatedRequest } from "../middlewares/auth.middleware.js";
import { driverRegistrationSchema } from "../zodSchemas/driver.schema.js";
import { DriverModel } from "../models/driver.model.js";
import { CloudinaryFolders } from "../constants/cloudinary.constant.js";
import cloudinaryService from "../services/cloudinary.service.js";

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


export const driverRegistrationController = asyncTryCatchHandler(
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

        const existingDriver = await DriverModel.findOne({
            user: userId,
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
                        const newDriver = await DriverModel.create({
                user: userId,
                profilePhoto: profilePhotoData,
                vehicleImages,
                vehicle,
                documents: driverDocuments,
            });

            return response.status(201).json({
                success: true,
                message:
                    "Driver profile created successfully. Awaiting verification.",
                data: {
                    id: newDriver._id,
                    verificationStatus:
                        newDriver.verificationStatus,
                },
            });
        } catch (error: any) {
            await rollbackUploads();

            if (error.code === 11000) {
                const duplicateField = Object.keys(
                    error.keyPattern ?? {}
                )[0];

                let message = "Duplicate data found.";

                switch (duplicateField) {
                    case "user":
                        message =
                            "Driver profile already exists.";
                        break;

                    case "vehicle.registrationNumber":
                        message =
                            "Vehicle registration number is already registered.";
                        break;

                    default:
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

export const driverProfileController = asyncTryCatchHandler(
    async (request: Request, response: Response) => {
        const authRequest = request as AuthenticatedRequest;
        const userId = authRequest.userId;
        const driverProfile = await DriverModel.findOne({ user : userId });
        if (!driverProfile) {
            return response.status(404).json(
                {
                    message: "You have not Registered for the Driver Role till now "
                }
            )
        }
        return response.status(200).json(
            {
                message: "Driver Profile Fetched Successfully",
                data: driverProfile
            }
        )
    }
)