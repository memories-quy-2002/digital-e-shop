import { z } from "zod";

const positiveInteger = z.coerce.number().int().positive().safe();

export const adminPaymentAttemptQueueQuerySchema = z.object({
    page: positiveInteger.optional(),
    limit: positiveInteger.optional(),
}).strict();

export const adminPaymentAttemptRetrySchema = z.object({
    reason: z.string().trim().min(1).max(500),
}).strict();

export const adminPaymentAttemptRefundSchema = z.object({
    amountVnd: z.number().int().positive().safe(),
    transferReference: z.string().trim().min(1).max(191),
    idempotencyKey: z.uuid(),
    transferredAt: z.iso.date(),
    evidenceId: positiveInteger,
    reason: z.string().trim().min(1).max(500),
}).strict();

export type AdminPaymentAttemptQueueQuery = z.infer<typeof adminPaymentAttemptQueueQuerySchema>;
export type AdminPaymentAttemptRetryBody = z.infer<typeof adminPaymentAttemptRetrySchema>;
export type AdminPaymentAttemptRefundBody = z.infer<typeof adminPaymentAttemptRefundSchema>;
