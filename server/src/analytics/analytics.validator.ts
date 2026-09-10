import { z } from "zod";
import { analyticsRangeSchema } from "./analytics-range";

export const analyticsSummaryQuerySchema = z.object({
    range: analyticsRangeSchema,
}).passthrough();
