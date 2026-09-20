import { z } from "zod";
import { AFTER_SALES_KINDS, AFTER_SALES_STATUSES } from "./after-sales.types";

const positiveInt = (field: string) => z.coerce.number({ error: `${field} must be a number` })
    .int(`${field} must be a whole number`)
    .positive(`${field} must be greater than zero`)
    .refine(Number.isSafeInteger, `${field} must be a safe integer`);

const text = (field: string, max: number) => z.string({ error: `${field} is required` }).trim().min(1, `${field} is required`).max(max, `${field} is too long`);

const itemSchema = z.object({
    orderItemId: positiveInt("Order item id"),
    quantity: positiveInt("Quantity").max(99, "Quantity must not exceed 99"),
    reason: z.string().trim().max(500, "Item reason is too long").optional(),
}).strict();

const createBaseSchema = z.object({
    orderId: positiveInt("Order id"),
    kind: z.enum(AFTER_SALES_KINDS),
    reason: text("Reason", 5000),
    items: z.array(itemSchema).min(1, "At least one item is required").max(50, "Too many items requested"),
    idempotencyKey: text("Idempotency key", 128),
}).strict();

export const afterSalesCreateSchema = createBaseSchema;

export const afterSalesGuestCreateSchema = createBaseSchema.extend({
    guestOrderToken: text("Guest order token", 256),
}).strict();

export const afterSalesListQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).transform((value) => Math.min(value, 100)).default(50),
    status: z.enum(AFTER_SALES_STATUSES).optional(),
    kind: z.enum(AFTER_SALES_KINDS).optional(),
}).strict();

export const afterSalesGuestLookupSchema = z.object({
    orderId: positiveInt("Order id"),
    guestOrderToken: text("Guest order token", 256),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).transform((value) => Math.min(value, 100)).default(50),
    status: z.enum(AFTER_SALES_STATUSES).optional(),
    kind: z.enum(AFTER_SALES_KINDS).optional(),
}).strict();

export const afterSalesStatusSchema = z.object({
    status: z.enum(AFTER_SALES_STATUSES),
    note: z.string().trim().max(5000, "Note is too long").optional(),
}).strict();

export const refundConfirmationSchema = z.object({
    refundReference: text("Refund reference", 255),
    currency: z.string().trim().length(3, "Currency must be a three-letter code").toUpperCase(),
    idempotencyKey: text("Idempotency key", 128),
    note: z.string().trim().max(5000, "Note is too long").optional(),
}).strict();
