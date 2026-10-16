import { describe, expect, it } from "vitest";
import { adminAuditQuerySchema } from "./admin-audit.validator";

describe("adminAuditQuerySchema", () => {
    it("applies bounded pagination defaults", () => {
        expect(adminAuditQuerySchema.parse({})).toEqual({ page: 1, limit: 25, search: "" });
    });

    it("normalizes search and accepts supported entity filters", () => {
        expect(adminAuditQuerySchema.parse({ search: "  stock  ", entityType: "product" })).toEqual({
            page: 1,
            limit: 25,
            search: "stock",
            entityType: "product",
        });
    });

    it("rejects unbounded pages, oversized limits, and unknown entity types", () => {
        expect(adminAuditQuerySchema.safeParse({ page: 0 }).success).toBe(false);
        expect(adminAuditQuerySchema.safeParse({ page: 1_000_001 }).success).toBe(false);
        expect(adminAuditQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
        expect(adminAuditQuerySchema.safeParse({ entityType: "order" }).success).toBe(false);
        expect(adminAuditQuerySchema.safeParse({ search: "x".repeat(121) }).success).toBe(false);
    });
});
