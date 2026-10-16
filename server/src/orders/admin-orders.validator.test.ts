import { describe, expect, it } from "vitest";
import { adminOrdersQuerySchema } from "./orders.validator";

describe("adminOrdersQuerySchema", () => {
    it("defaults to a bounded first page and normalizes search text", () => {
        expect(adminOrdersQuerySchema.parse({ search: "  #42  " })).toEqual({
            page: 1,
            limit: 25,
            search: "#42",
            status: undefined,
            paymentMethod: undefined,
            sort: "newest",
        });
    });

    it("rejects out-of-range pagination and unsupported filters", () => {
        expect(adminOrdersQuerySchema.safeParse({ page: "0" }).success).toBe(false);
        expect(adminOrdersQuerySchema.safeParse({ page: 1_000_001 }).success).toBe(false);
        expect(adminOrdersQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
        expect(adminOrdersQuerySchema.safeParse({ status: "7" }).success).toBe(false);
        expect(adminOrdersQuerySchema.safeParse({ paymentMethod: "cashapp" }).success).toBe(false);
    });
});
