import { describe, expect, it } from "vitest";
import { receiptOrderIdSchema } from "./purchase-receipts.validator";

describe("purchase receipt route parameter validation", () => {
    it("coerces positive numeric path params while rejecting invalid IDs", () => {
        expect(receiptOrderIdSchema.parse("12")).toBe(12);
        expect(receiptOrderIdSchema.safeParse("0").success).toBe(false);
        expect(receiptOrderIdSchema.safeParse("not-an-id").success).toBe(false);
    });
});
