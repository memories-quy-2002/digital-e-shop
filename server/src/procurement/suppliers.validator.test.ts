import { describe, expect, it } from "vitest";
import { updateSupplierSchema, createSupplierSchema } from "./suppliers.validator";

describe("supplier validation", () => {
    it("normalizes supplier codes and rejects empty updates", () => {
        expect(createSupplierSchema.parse({ code: "acme-01", name: "Acme" }).code).toBe("ACME-01");
        expect(updateSupplierSchema.safeParse({ version: 1 }).success).toBe(false);
    });

    it("requires a positive version and rejects unknown fields", () => {
        expect(updateSupplierSchema.safeParse({ version: 0, name: "Acme" }).success).toBe(false);
        expect(updateSupplierSchema.safeParse({ version: 1, unexpected: true }).success).toBe(false);
    });
});
