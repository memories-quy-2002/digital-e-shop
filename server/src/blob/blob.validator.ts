import { z } from "zod";

export const blobHealthQuerySchema = z.object({
    cleanup: z.union([z.literal("true"), z.literal("false"), z.undefined()]).optional(),
});
