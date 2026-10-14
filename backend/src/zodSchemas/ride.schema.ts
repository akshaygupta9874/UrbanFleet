import { z } from "zod";

export const createRideSchema = z.object({
    rider: z.string().trim().min(1, "Invalid Rider ID").optional(),
    pickup: z.object({
        address: z.string().trim().min(1),
        coordinates: z.object({
            latitude: z.number(),
            longitude: z.number(),
        }),
    }),
    destination: z.object({
        address: z.string().trim().min(1),
        coordinates: z.object({
            latitude: z.number(),
            longitude: z.number(),
        }),
    }),
    fare: z.object({
        estimated: z.number().positive(),
    }),
    distance: z.object({
        estimated: z.number().positive(),
    }),
    duration: z.object({
        estimated: z.number().positive(),
    }),
    vehicleType : z.string()
});

export type CreateRideInput = z.infer<typeof createRideSchema>;