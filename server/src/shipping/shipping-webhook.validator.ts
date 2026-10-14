import { UnauthorizedException } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

export function verifyCarrierSecret(expected?: string, actual?: string) {
    if (!expected || !actual || Buffer.byteLength(actual) !== Buffer.byteLength(expected)
        || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) throw new UnauthorizedException("Carrier authentication failed");
}
export const carrierWebhookSchema = z.object({
    ShopID: z.number().int().positive(), OrderCode: z.string().min(1).max(100), ClientOrderCode: z.string().regex(/^digital-e-order-\d+$/),
    Type: z.string().min(1).max(40), Time: z.iso.datetime({ offset: true }), Status: z.string().min(1).max(40),
    CODAmount: z.number().int().safe().nonnegative(), TotalFee: z.number().int().safe().nonnegative().optional(),
});
