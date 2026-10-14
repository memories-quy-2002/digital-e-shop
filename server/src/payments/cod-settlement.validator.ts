import { z } from "zod";

const nonNegativeVnd = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const positiveInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const settlementInputSchema = z.object({
    remittedVnd: nonNegativeVnd,
    transferReference: z.string().trim().min(1).max(191),
    transferDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
        const [year, month, day] = value.split("-").map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));
        return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
    }, "transferDate must be a real calendar date"),
    evidenceId: positiveInteger,
}).strict();
export type SettlementInput = z.infer<typeof settlementInputSchema>;
