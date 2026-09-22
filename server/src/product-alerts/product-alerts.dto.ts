import type { z } from "zod";
import { productAlertUpdateSchema } from "./product-alerts.validator";

export type ProductAlertUpdateInput = z.infer<typeof productAlertUpdateSchema>;
