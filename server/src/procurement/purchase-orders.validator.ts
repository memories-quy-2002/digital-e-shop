import { z } from "zod";

const positiveId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const quantity = z.number().int().positive().max(2_147_483_647);
const vnd = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const version = z.number().int().positive().max(2_147_483_647);

export const purchaseOrderLineSchema = z.object({
    productId: positiveId,
    orderedQuantity: quantity,
    unitCostVnd: vnd,
    note: z.string().trim().max(500).optional(),
}).strict();

const linesSchema = z.array(purchaseOrderLineSchema).min(1).max(100).superRefine((lines, ctx) => {
    const productIds = lines.map((line) => line.productId);
    if (new Set(productIds).size !== productIds.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A product can appear only once in a purchase order", path: [] });
    }
    const amount = lines.reduce((sum, line) => sum + line.orderedQuantity * line.unitCostVnd, 0);
    if (!Number.isSafeInteger(amount)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Purchase order total exceeds the safe VND range", path: [] });
});

export const createPurchaseOrderSchema = z.object({
    supplierId: positiveId,
    note: z.string().trim().max(2000).optional(),
    lines: linesSchema,
}).strict();

export const updatePurchaseOrderSchema = createPurchaseOrderSchema.extend({ version }).strict();
export const documentActionSchema = z.object({ version, reason: z.string().trim().min(8).max(500).optional() }).strict();
export const cancelPurchaseOrderSchema = documentActionSchema.extend({ reason: z.string().trim().min(8).max(500) }).strict();
export const closePurchaseOrderSchema = cancelPurchaseOrderSchema;
// Nest route params arrive as strings; body identifiers remain strict numbers.
export const purchaseOrderIdSchema = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const purchaseOrdersQuerySchema = z.object({
    page: z.coerce.number().int().positive().max(1_000_000).default(1),
    limit: z.coerce.number().int().positive().max(100).default(25),
    search: z.string().trim().max(120).optional().default(""),
    status: z.enum(["DRAFT", "ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "CLOSED", "CANCELED", "all"]).default("all"),
    supplierId: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
}).strict();
