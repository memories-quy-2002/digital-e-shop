import { z } from "zod";
import { AFTER_SALES_KINDS, AFTER_SALES_STATUSES } from "./after-sales.types";
import { AFTER_SALES_PAGINATION, AFTER_SALES_VALIDATION_LIMITS } from "./after-sales.constants";

const positiveInt = (field: string) => z.coerce.number({ error: `${field} must be a number` })
    .int(`${field} must be a whole number`)
    .positive(`${field} must be greater than zero`)
    .refine(Number.isSafeInteger, `${field} must be a safe integer`);

const text = (field: string, max: number) => z.string({ error: `${field} is required` }).trim().min(1, `${field} is required`).max(max, `${field} is too long`);

const itemSchema = z.object({
    orderItemId: positiveInt("Order item id"),
    quantity: positiveInt("Quantity").max(AFTER_SALES_VALIDATION_LIMITS.ITEM_QUANTITY, "Quantity must not exceed 99"),
    reason: z.string().trim().max(AFTER_SALES_VALIDATION_LIMITS.ITEM_REASON_LENGTH, "Item reason is too long").optional(),
}).strict();

const createBaseSchema = z.object({
    orderId: positiveInt("Order id"),
    kind: z.enum(AFTER_SALES_KINDS),
    reason: text("Reason", AFTER_SALES_VALIDATION_LIMITS.REQUEST_REASON_LENGTH),
    items: z.array(itemSchema).min(1, "At least one item is required").max(AFTER_SALES_VALIDATION_LIMITS.ITEMS_PER_REQUEST, "Too many items requested"),
    idempotencyKey: text("Idempotency key", AFTER_SALES_VALIDATION_LIMITS.IDEMPOTENCY_KEY_LENGTH),
}).strict();

export const afterSalesCreateSchema = createBaseSchema;

export const afterSalesGuestCreateSchema = createBaseSchema.extend({
    guestOrderToken: text("Guest order token", 256),
}).strict();

export const afterSalesListQuerySchema = z.object({
    page: z.coerce.number().int().min(AFTER_SALES_PAGINATION.FIRST_PAGE).default(AFTER_SALES_PAGINATION.FIRST_PAGE),
    limit: z.coerce.number().int().min(AFTER_SALES_PAGINATION.MIN_PAGE_SIZE).transform((value) => Math.min(value, AFTER_SALES_PAGINATION.MAX_PAGE_SIZE)).default(AFTER_SALES_PAGINATION.DEFAULT_PAGE_SIZE),
    status: z.enum(AFTER_SALES_STATUSES).optional(),
    kind: z.enum(AFTER_SALES_KINDS).optional(),
}).strict();

export const afterSalesGuestLookupSchema = z.object({
    orderId: positiveInt("Order id"),
    guestOrderToken: text("Guest order token", AFTER_SALES_VALIDATION_LIMITS.GUEST_ORDER_TOKEN_LENGTH),
    page: z.coerce.number().int().min(AFTER_SALES_PAGINATION.FIRST_PAGE).default(AFTER_SALES_PAGINATION.FIRST_PAGE),
    limit: z.coerce.number().int().min(AFTER_SALES_PAGINATION.MIN_PAGE_SIZE).transform((value) => Math.min(value, AFTER_SALES_PAGINATION.MAX_PAGE_SIZE)).default(AFTER_SALES_PAGINATION.DEFAULT_PAGE_SIZE),
    status: z.enum(AFTER_SALES_STATUSES).optional(),
    kind: z.enum(AFTER_SALES_KINDS).optional(),
}).strict();

export const afterSalesStatusSchema = z.object({
    status: z.enum(AFTER_SALES_STATUSES),
    note: z.string().trim().max(AFTER_SALES_VALIDATION_LIMITS.NOTE_LENGTH, "Note is too long").optional(),
}).strict();

export const refundConfirmationSchema = z.object({
    refundReference: text("Refund reference", AFTER_SALES_VALIDATION_LIMITS.REFUND_REFERENCE_LENGTH),
    currency: z.string().trim().length(AFTER_SALES_VALIDATION_LIMITS.CURRENCY_CODE_LENGTH, "Currency must be a three-letter code").toUpperCase(),
    idempotencyKey: text("Idempotency key", AFTER_SALES_VALIDATION_LIMITS.IDEMPOTENCY_KEY_LENGTH),
    note: z.string().trim().max(AFTER_SALES_VALIDATION_LIMITS.NOTE_LENGTH, "Note is too long").optional(),
}).strict();
