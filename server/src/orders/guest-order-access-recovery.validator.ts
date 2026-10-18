import { z } from "zod";

const orderId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const email = z.string().trim().email().max(254);

export const guestOrderAccessRecoveryRequestSchema = z.object({ orderId, email });
export const guestOrderAccessRecoveryVerifySchema = z.object({
    orderId,
    email,
    code: z.string().regex(/^\d{6}$/),
});

export type GuestOrderAccessRecoveryRequest = z.infer<typeof guestOrderAccessRecoveryRequestSchema>;
export type GuestOrderAccessRecoveryVerify = z.infer<typeof guestOrderAccessRecoveryVerifySchema>;
