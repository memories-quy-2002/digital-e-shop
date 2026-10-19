import { z } from "zod";

const orderId = z.union([z.number().int().positive().max(Number.MAX_SAFE_INTEGER), z.uuidv7()]);
const email = z.string().trim().email().max(254);

export const guestOrderAccessRecoveryRequestSchema = z.object({ orderId, email });
export const guestOrderAccessRecoveryVerifySchema = z.object({
    orderId,
    email,
    code: z.string().regex(/^\d{6}$/),
});

export type GuestOrderAccessRecoveryRequest = { orderId: string | number; email: string };
export type GuestOrderAccessRecoveryVerify = GuestOrderAccessRecoveryRequest & { code: string };
