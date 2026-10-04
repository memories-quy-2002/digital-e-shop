import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseBody, getValidationMessage } from "./request-validation";
import { purchaseSchema } from "../../orders/orders.validator";
import { productCreateSchema } from "../../products/products.validator";

const purchase = {
    totalPrice: 100,
    cart: [{ productId: 1, quantity: 1, price: 100 }],
    discount: 0,
    shippingAddress: "1 Test Street",
};

describe("purchase schema", () => {
    it.each(["stripe", "card", "bank_transfer"])("rejects legacy payment method %s", (paymentMethod) => {
        expect(() => purchaseSchema.parse({ ...purchase, paymentMethod })).toThrow("Unsupported payment method");
    });

    it.each(["cash", "payos"])("accepts active payment method %s", (paymentMethod) => {
        expect(purchaseSchema.parse({ ...purchase, paymentMethod }).paymentMethod).toBe(paymentMethod);
    });
});

describe("feature request schemas", () => {
    it("accepts checkout discount codes from the feature schema", () => {
        const parsed = purchaseSchema.parse({
            ...purchase,
            paymentMethod: "cash",
            discountCode: "SAVE10",
        });

        expect(parsed.discountCode).toBe("SAVE10");
    });

    it("preserves structured product attributes", () => {
        const attributes = [{ key: "memory", label: "Memory", type: "text", textValue: "16 GB" }];
        const parsed = productCreateSchema.parse({
            name: "Test product",
            category: "Components",
            brand: "Test",
            price: 100,
            inventory: 1,
            attributes,
        });

        expect(parsed.attributes).toEqual([{ ...attributes[0], filterable: true }]);
    });
});

describe("request validation helpers", () => {
    it("returns parsed values and formats validation issues", () => {
        const schema = z.object({ count: z.coerce.number().int().positive() });
        expect(parseBody(schema, { count: "2" })).toEqual({ count: 2 });
        const invalid = schema.safeParse({ count: -1 });
        if (invalid.success) throw new Error("Expected invalid input");
        expect(getValidationMessage(invalid.error)).toBe(invalid.error.issues.map((issue) => issue.message).join("; "));
    });

    it("keeps the generic message for non-validation errors", () => {
        expect(getValidationMessage(new Error("internal details"))).toBe("Invalid request payload");
    });
});
