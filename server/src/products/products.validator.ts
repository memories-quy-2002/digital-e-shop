import { z } from "zod";

const requiredText = (field: string) => z.string({ error: `${field} is required` }).trim().min(1, `${field} is required`);
const nonNegativeNumber = (field: string) => z.coerce.number({ error: `${field} must be a number` }).nonnegative(`${field} cannot be negative`);

export const productCreateSchema = z.object({
    name: requiredText("Product name"),
    description: z.string().trim().optional().default(""),
    category: requiredText("Category"),
    brand: requiredText("Brand"),
    specifications: z.string().trim().optional().default(""),
    price: nonNegativeNumber("Price"),
    inventory: z.coerce.number({ error: "Inventory must be a number" }).int("Inventory must be a whole number").nonnegative("Inventory cannot be negative"),
    imageUrl: z.string().trim().optional(),
});

export const productUpdateSchema = z.object({
    name: requiredText("Product name").optional(),
    description: z.string().trim().optional(),
    category: requiredText("Category").optional(),
    brand: requiredText("Brand").optional(),
    specifications: z.string().trim().optional(),
    price: nonNegativeNumber("Price").optional(),
    salePrice: z.union([nonNegativeNumber("Sale price"), z.literal(""), z.null(), z.undefined()]).optional(),
    stock: z.coerce.number({ error: "Stock must be a number" }).int("Stock must be a whole number").nonnegative("Stock cannot be negative").optional(),
});

export const inventoryUpdateSchema = z.object({
    stock: z.coerce.number({ error: "Stock must be a number" }).int("Stock must be a whole number").nonnegative("Stock cannot be negative"),
});
