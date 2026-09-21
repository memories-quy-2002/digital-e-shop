import { z } from "zod";

const userIdSchema = z.string({ error: "User id is required" }).trim().min(1, "User id is required");
const productIdSchema = z.coerce.number({ error: "Product id must be a number" })
    .int("Product id must be a whole number")
    .positive("Product id must be greater than zero");

export const productAlertUserParamSchema = userIdSchema;
export const productAlertProductIdSchema = productIdSchema;
export const productAlertUpdateSchema = z.object({
    priceDropEnabled: z.boolean(),
    backInStockEnabled: z.boolean(),
}).strict();
