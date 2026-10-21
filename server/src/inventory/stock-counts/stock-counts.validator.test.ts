import { describe, expect, it } from "vitest";
import { stockCountIdSchema } from "./stock-counts.validator";

describe("stock count route parameter validation", () => {
    it("coerces positive numeric path params while rejecting invalid IDs", () => {
        expect(stockCountIdSchema.parse("12")).toBe(12);
        expect(stockCountIdSchema.safeParse("0").success).toBe(false);
        expect(stockCountIdSchema.safeParse("not-an-id").success).toBe(false);
    });
});
