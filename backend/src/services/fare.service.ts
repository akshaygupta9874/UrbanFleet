import { IRide } from "./ride.service.js";
import { IFareBreakdown } from "../payment/types/payment.types.js";

const PLATFORM_COMMISSION_PERCENT = 10;
const BASE_FARE_PAISE = 2_500; // ₹25
const PER_KILOMETER_PAISE = 500; // ₹5/km
const SURGE_CHARGE_PAISE = 400; // ₹4
const VEHICLE_MULTIPLIERS: Record<string, number> = {
    bike: 0.7,
    auto: 0.9,
    car: 1.2,
};

class FareService {
    calculateFinalFare(
        ride: IRide,
        vehicleType?: string
    ): IFareBreakdown {
        return this.calculateFareForDistance(ride.distance.estimated, vehicleType);
    }

    calculateFareForDistance(
        distanceKilometers: number,
        vehicleType = "car"
    ): IFareBreakdown {
        const distanceKm = Math.max(0, Number.isFinite(distanceKilometers) ? distanceKilometers : 0);
        const multiplier = VEHICLE_MULTIPLIERS[vehicleType.toLowerCase()] ?? 1.2;
        const baseFarePaise = Math.round(BASE_FARE_PAISE * multiplier);
        const distanceFarePaise = Math.round(distanceKm * PER_KILOMETER_PAISE * multiplier);
        const timeFarePaise = 0;
        const surgePaise = Math.round(SURGE_CHARGE_PAISE * multiplier);
        const totalPaise = baseFarePaise + distanceFarePaise + timeFarePaise + surgePaise;

        const platformCommissionPaise = Math.round(
            totalPaise * (PLATFORM_COMMISSION_PERCENT / 100)
        );

        const driverEarningPaise = totalPaise - platformCommissionPaise;

        return {
            baseFarePaise,
            distanceFarePaise,
            timeFarePaise,
            surgePaise,
            platformCommissionPaise,
            driverEarningPaise,
            totalPaise,
        };
    }
}

export const fareService = new FareService();
