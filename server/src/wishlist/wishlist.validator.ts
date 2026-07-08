import { z } from "zod";

const requiredText = (field: string) => z.string({ error: `${field} is required` }).trim().min(1, `${field} is required`);
const positiveInt = (field: string) => z.coerce.number({ error: `${field} must be a number` }).int(`${field} must be a whole number`).positive(`${field} must be greater than zero`);

export const wishlistAddSchema = z.object({
    uid: requiredText("User id"),
    pid: positiveInt("Product id"),
});

export const wishlistDeleteSchema = z.object({
    uid: requiredText("User id"),
    pid: positiveInt("Product id"),
});

export const wishlistBulkDeleteSchema = z.object({
    uid: requiredText("User id"),
    productIds: z.array(positiveInt("Product id")).min(1, "At least one product is required"),
});
