import { z } from "zod";

export const adminAuditQuerySchema = z.object({
    page: z.coerce.number().int().min(1).max(1_000_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    search: z.string().trim().max(120).default(""),
    entityType: z.enum(["product", "user", "promotion"]).optional(),
});
