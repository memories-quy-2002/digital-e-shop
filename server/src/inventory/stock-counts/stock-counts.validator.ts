import { z } from "zod";

const positiveId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const version = z.number().int().positive().max(2_147_483_647);

export const createStockCountSchema = z.object({
    productIds: z.array(positiveId).min(1).max(200),
    note: z.string().trim().max(2000).optional(),
}).strict().superRefine(({ productIds }, ctx) => {
    if (new Set(productIds).size !== productIds.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Products must be unique", path: ["productIds"] });
});

export const updateStockCountSchema = z.object({
    version,
    observations: z.array(z.object({
        itemId: positiveId,
        countedQuantity: z.number().int().nonnegative().max(2_147_483_647),
        reason: z.string().trim().min(8).max(500).optional(),
    }).strict()).min(1).max(200),
}).strict().superRefine(({ observations }, ctx) => {
    const ids = observations.map((item) => item.itemId);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Count items must be unique", path: ["observations"] });
});

export const countActionSchema = z.object({ version, reason: z.string().trim().min(8).max(500).optional() }).strict();
export const reopenCountSchema = countActionSchema.extend({
    reason: z.string().trim().min(8).max(500),
    itemIds: z.array(positiveId).min(1).max(200),
}).strict().superRefine(({ itemIds }, ctx) => {
    if (new Set(itemIds).size !== itemIds.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Count item IDs must be unique", path: ["itemIds"] });
});
export const cancelCountSchema = countActionSchema.extend({ reason: z.string().trim().min(8).max(500) }).strict();
// Nest route params arrive as strings; request body identifiers remain strict numbers.
export const stockCountIdSchema = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const stockCountsQuerySchema = z.object({
    page: z.coerce.number().int().positive().max(1_000_000).default(1),
    limit: z.coerce.number().int().positive().max(100).default(25),
    search: z.string().trim().max(120).optional().default(""),
    status: z.enum(["DRAFT", "SUBMITTED", "APPROVED", "CANCELED", "all"]).default("all"),
}).strict();
