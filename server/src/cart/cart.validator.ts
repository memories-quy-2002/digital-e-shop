import { z } from "zod";

const requiredText = (field: string) => z.string({ error: `${field} is required` }).trim().min(1, `${field} is required`);
const positiveInt = (field: string) => z.coerce.number({ error: `${field} must be a number` }).int(`${field} must be a whole number`).positive(`${field} must be greater than zero`);

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
