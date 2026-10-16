import { z } from "zod";

export const deliveryAddressSchema = z.object({
    recipientName: z.string().trim().min(1).max(160),
    recipientPhone: z.string().trim().min(7).max(40),
    addressLine: z.string().trim().min(1).max(255),
    city: z.string().trim().min(1).max(120),
    country: z.literal("VN"),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
}).strict();

export const packingTransitionSchema = z.object({
    state: z.enum(["CONFIRMED", "PICKING", "PACKED", "READY_TO_SHIP"]),
});
