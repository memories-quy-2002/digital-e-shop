import { z } from "zod";

export const taskRunnerInputSchema = z.object({
    limit: z.number().int().min(1).max(100).default(20),
    budgetMs: z.number().int().min(17000).max(20000).default(20000),
}).strict();
