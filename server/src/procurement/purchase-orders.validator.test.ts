import { describe, expect, it } from "vitest";
import { purchaseOrderIdSchema } from "./purchase-orders.validator";

describe("purchase order route parameter validation", () => {
    it("coerces positive numeric path params while rejecting invalid IDs", () => {
        expect(purchaseOrderIdSchema.parse("12")).toBe(12);
        expect(purchaseOrderIdSchema.safeParse("0").success).toBe(false);
        expect(purchaseOrderIdSchema.safeParse("not-an-id").success).toBe(false);
    });
});
