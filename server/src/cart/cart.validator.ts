import { z } from "zod";

const requiredText = (field: string) => z.string({ error: `${field} is required` }).trim().min(1, `${field} is required`);
const positiveInt = (field: string) => z.coerce.number({ error: `${field} must be a number` }).int(`${field} must be a whole number`).positive(`${field} must be greater than zero`);
const guestCartItemSchema = z.object({
    productId: positiveInt("Product id"),
    quantity: positiveInt("Quantity").max(99, "Quantity must not exceed 99"),
});

export const cartAddItemSchema = z.object({
    pid: positiveInt("Product id"),
    uid: requiredText("User id"),
    quantity: positiveInt("Quantity"),
});

export const cartDeleteItemSchema = z.object({
    cartItemId: positiveInt("Cart item id"),
});

export const cartUpdateQuantitySchema = z.object({
    cartItemId: positiveInt("Cart item id"),
    quantity: positiveInt("Quantity"),
});

export const guestCartPreviewSchema = z.object({
    items: z.array(guestCartItemSchema).min(1, "Cart must contain at least one item").max(50, "Cart must not contain more than 50 items"),
    discountCode: z.string().trim().max(50, "Discount code must not exceed 50 characters")
        .transform((value) => value.toUpperCase() || undefined)
        .optional(),
}).superRefine((data, context) => {
    const quantities = new Map<number, number>();
    data.items.forEach((item, index) => {
        const totalQuantity = (quantities.get(item.productId) || 0) + item.quantity;
        quantities.set(item.productId, totalQuantity);
        if (totalQuantity > 99) {
            context.addIssue({
                code: "custom",
                path: ["items", index, "quantity"],
                message: "Combined quantity for a product must not exceed 99",
            });
        }
    });
});
