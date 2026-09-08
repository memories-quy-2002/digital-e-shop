import { z } from "zod";
import { SUPPORT_PRIORITIES, SUPPORT_STATUSES } from "./support.types";

export const supportTicketCreateSchema = z.object({
    subject: z.string().trim().min(3).max(160),
    message: z.string().trim().min(1).max(5000),
    category: z.string().trim().min(1).max(32).optional(),
    orderId: z.coerce.number().int().positive().optional(),
});

export const supportTicketQuerySchema = z.object({
    status: z.enum(SUPPORT_STATUSES).optional(),
});

export const supportTicketUpdateSchema = z.object({
    status: z.enum(SUPPORT_STATUSES).optional(),
    priority: z.enum(SUPPORT_PRIORITIES).optional(),
    adminNote: z.string().trim().max(5000).optional(),
}).refine((value) => Object.keys(value).length > 0, { message: "At least one ticket field is required" });
