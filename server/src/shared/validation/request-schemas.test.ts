import { describe, expect, it } from "vitest";
import * as sharedSchemas from "./request-schemas";
import {
    cartAddItemSchema as featureCartAddItemSchema,
    cartDeleteItemSchema as featureCartDeleteItemSchema,
    cartUpdateQuantitySchema as featureCartUpdateQuantitySchema,
} from "../../cart/cart.validator";
import { addressSchema as featureAddressSchema } from "../../addresses/addresses.validator";
import {
    orderStatusSchema as featureOrderStatusSchema,
    purchaseSchema as featurePurchaseSchema,
    applyDiscountSchema as featureApplyDiscountSchema,
} from "../../orders/orders.validator";
import {
    productCreateSchema as featureProductCreateSchema,
    productUpdateSchema as featureProductUpdateSchema,
    inventoryUpdateSchema as featureInventoryUpdateSchema,
} from "../../products/products.validator";
import { promotionSchema as featurePromotionSchema } from "../../promotions/promotions.validator";
import { adminUserUpdateSchema as featureAdminUserUpdateSchema } from "../../users/users.validator";
import {
    userLoginSchema as featureUserLoginSchema,
    registerUserSchema as featureRegisterUserSchema,
} from "../../auth/auth.validator";

const { purchaseSchema } = sharedSchemas;

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

describe("shared schemas remain compatibility re-exports", () => {
    it.each([
        ["cartAddItemSchema", featureCartAddItemSchema],
        ["cartDeleteItemSchema", featureCartDeleteItemSchema],
        ["cartUpdateQuantitySchema", featureCartUpdateQuantitySchema],
        ["promotionSchema", featurePromotionSchema],
        ["addressSchema", featureAddressSchema],
        ["adminUserUpdateSchema", featureAdminUserUpdateSchema],
        ["orderStatusSchema", featureOrderStatusSchema],
        ["purchaseSchema", featurePurchaseSchema],
        ["applyDiscountSchema", featureApplyDiscountSchema],
        ["productCreateSchema", featureProductCreateSchema],
        ["productUpdateSchema", featureProductUpdateSchema],
        ["inventoryUpdateSchema", featureInventoryUpdateSchema],
        ["userLoginSchema", featureUserLoginSchema],
        ["registerUserSchema", featureRegisterUserSchema],
    ])("re-exports the feature-owned %s", (name, featureSchema) => {
        expect(sharedSchemas[name as keyof typeof sharedSchemas] === featureSchema).toBe(true);
    });

    it("accepts checkout discount codes from the feature schema", () => {
        const parsed = sharedSchemas.purchaseSchema.parse({
            ...purchase,
            paymentMethod: "cash",
            discountCode: "SAVE10",
        });

        expect(parsed.discountCode).toBe("SAVE10");
    });

    it("preserves structured product attributes", () => {
        const attributes = [{ key: "memory", label: "Memory", type: "text", textValue: "16 GB" }];
        const parsed = sharedSchemas.productCreateSchema.parse({
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
