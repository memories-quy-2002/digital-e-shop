import { z } from "zod";

const positiveId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const quantity = z.number().int().nonnegative().max(2_147_483_647);
const vnd = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const receiptLineSchema = z.object({
    purchaseOrderItemId: positiveId,
    expectedQuantity: quantity.min(1),
    acceptedQuantity: quantity,
    rejectedQuantity: quantity,
    missingQuantity: quantity,
    unitCostVnd: vnd,
    actualCostReason: z.string().trim().min(8).max(500).optional(),
    note: z.string().trim().max(500).optional(),
}).strict().superRefine((line, ctx) => {
    if (line.acceptedQuantity + line.rejectedQuantity + line.missingQuantity !== line.expectedQuantity) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Accepted, rejected and missing quantities must equal the expected quantity", path: ["expectedQuantity"] });
    }
    if ((line.rejectedQuantity > 0 || line.missingQuantity > 0) && !line.note?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Add a note for rejected or missing goods", path: ["note"] });
    }
    if (line.actualCostReason && !line.actualCostReason.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Explain the actual unit cost difference", path: ["actualCostReason"] });
    }
});

export const postReceiptSchema = z.object({
    idempotencyKey: z.string().uuid(),
    lines: z.array(receiptLineSchema).min(1).max(100),
    note: z.string().trim().max(2000).optional(),
}).strict().superRefine((input, ctx) => {
    const ids = input.lines.map((line) => line.purchaseOrderItemId);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A purchase order line can appear only once per receipt", path: ["lines"] });
});

export const receiptListQuerySchema = z.object({
    page: z.coerce.number().int().positive().max(1_000_000).default(1),
    limit: z.coerce.number().int().positive().max(100).default(25),
}).strict();

// Nest route params arrive as strings; receipt body identifiers remain strict numbers.
export const receiptOrderIdSchema = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
