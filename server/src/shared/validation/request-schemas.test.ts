import { describe, expect, it } from "vitest";
import { purchaseSchema } from "./request-schemas";

const purchase = {
    totalPrice: 100,
    cart: [{ productId: 1, quantity: 1, price: 100 }],
    discount: 0,
    shippingAddress: "1 Test Street",
};

describe("shared purchase schema", () => {
    it.each(["stripe", "card", "bank_transfer"])("rejects legacy payment method %s", (paymentMethod) => {
        expect(() => purchaseSchema.parse({ ...purchase, paymentMethod })).toThrow("Unsupported payment method");
    });

    it.each(["cash", "payos"])("accepts active payment method %s", (paymentMethod) => {
        expect(purchaseSchema.parse({ ...purchase, paymentMethod }).paymentMethod).toBe(paymentMethod);
    });
});
