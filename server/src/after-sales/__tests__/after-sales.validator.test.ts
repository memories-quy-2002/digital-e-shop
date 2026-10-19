import { describe, expect, it } from "vitest";
import { afterSalesCreateSchema, afterSalesGuestCreateSchema, afterSalesListQuerySchema, refundConfirmationSchema } from "../after-sales.validator";

describe("after-sales validators", () => {
    it("accepts a bounded customer request and normalizes pagination", () => {
        expect(afterSalesCreateSchema.parse({
            orderId: "42",
            kind: "RETURN",
            reason: "The item arrived damaged.",
            items: [{ orderItemId: "7", quantity: "1" }],
            idempotencyKey: "return-42-1",
        })).toMatchObject({ orderId: 42, items: [{ orderItemId: 7, quantity: 1 }] });
        expect(afterSalesListQuerySchema.parse({ page: "2", limit: "200" })).toMatchObject({ page: 2, limit: 100 });
    });

    it("requires the guest capability and prevents client refund amounts", () => {
        expect(() => afterSalesGuestCreateSchema.parse({
            orderId: 42,
            kind: "RETURN",
            reason: "Damaged",
            items: [{ orderItemId: 7, quantity: 1 }],
            idempotencyKey: "guest-return-42",
        })).toThrow();
        expect(() => refundConfirmationSchema.parse({
            refundReference: "manual-1",
            currency: "VND",
            idempotencyKey: "refund-1",
        })).not.toThrow();
        expect(() => refundConfirmationSchema.parse({
            refundReference: "manual-1",
            amount: 999,
            currency: "VND",
            idempotencyKey: "refund-2",
        })).toThrow();
    });

    it("accepts UUID v7 order references and rejects other UUID versions", () => {
        const orderId = "019a2b3c-4d5e-7f80-8123-456789abcdef";
        const request = {
            orderId,
            kind: "RETURN",
            reason: "The item arrived damaged.",
            items: [{ orderItemId: 7, quantity: 1 }],
            idempotencyKey: "return-public-id",
        };
        expect(afterSalesCreateSchema.parse(request).orderId).toBe(orderId);
        expect(() => afterSalesCreateSchema.parse({ ...request, orderId: "019a2b3c-4d5e-4f80-8123-456789abcdef" })).toThrow();
    });
});
