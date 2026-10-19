import { z } from "zod";

const alertIdSchema = z.string()
    .min(1)
    .max(191)
    .regex(/^(order|payment|inventory|support|customer)-[A-Za-z0-9_-]+$/);

export const acknowledgeAdminAlertsSchema = z.object({
    alertIds: z.array(alertIdSchema).min(1).max(100).transform((ids) => [...new Set(ids)]),
});

export const updateAdminAlertTriageSchema = z.object({
    alertId: alertIdSchema,
    action: z.enum(["claim", "release", "resolve", "reopen"]),
});
