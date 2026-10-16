import { describe, expect, it } from "vitest";
import { adminProductsQuerySchema, inventoryUpdateSchema } from "./products.validator";

describe("admin product validation", () => {
    it("defaults to a bounded product page and accepts inventory filters", () => {
        expect(adminProductsQuerySchema.parse({ stock: "low", search: "GPU" })).toEqual({
            page: 1,
            limit: 25,
            search: "GPU",
            stock: "low",
        });
        expect(adminProductsQuerySchema.safeParse({ page: 1_000_001 }).success).toBe(false);
        expect(adminProductsQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
        expect(adminProductsQuerySchema.safeParse({ stock: "negative" }).success).toBe(false);
    });

    it("requires a useful reason for inventory changes", () => {
        expect(inventoryUpdateSchema.safeParse({ stock: 10 }).success).toBe(false);
        expect(inventoryUpdateSchema.safeParse({ stock: 10, reason: "  Cycle count verified  " })).toMatchObject({
            success: true,
            data: { stock: 10, reason: "Cycle count verified" },
        });
    });
});
