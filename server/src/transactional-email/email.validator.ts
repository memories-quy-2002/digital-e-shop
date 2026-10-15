import { z } from "zod";

export const adminEmailListQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    afterId: z.coerce.number().int().positive().optional(),
}).strict();

export const adminEmailResendBodySchema = z.object({ acknowledgeUnknownOutcome: z.boolean().default(false) }).strict();
export const adminEmailIdSchema = z.string().regex(/^[1-9]\d{0,9}$/);
