import { z } from "zod";

export const inventoryMovementsQuerySchema = z.object({
    limit: z.union([z.coerce.number().int().positive(), z.undefined()]).optional(),
});
