import { z } from "zod";

const requiredText = (field: string) => z.string({ error: `${field} is required` }).trim().min(1, `${field} is required`);
const positiveInt = (field: string) => z.coerce.number({ error: `${field} must be a number` }).int(`${field} must be a whole number`).positive(`${field} must be greater than zero`);
const nonNegativeNumber = (field: string) => z.coerce.number({ error: `${field} must be a number` }).nonnegative(`${field} cannot be negative`);

export const orderStatusSchema = z.object({
    status: z.coerce.number().int().refine((value) => [0, 1, 2].includes(value), "Status is required"),
});

export const purchaseSchema = z.object({
    totalPrice: nonNegativeNumber("Total price"),
    cart: z.array(
        z.object({
            productId: positiveInt("Product id"),
            quantity: positiveInt("Quantity"),
            price: nonNegativeNumber("Price"),
            sale_price: z.union([nonNegativeNumber("Sale price"), z.null(), z.undefined()]).optional(),
        }),
    ).min(1, "Cart cannot be empty"),
    discount: nonNegativeNumber("Discount").default(0),
    shippingAddress: requiredText("Shipping address"),
    paymentMethod: z.enum(["bank_transfer", "cash"], { error: "Unsupported payment method" }),
});

export const applyDiscountSchema = z.object({
    discountCode: requiredText("Discount code"),
    price: nonNegativeNumber("Price"),
});
