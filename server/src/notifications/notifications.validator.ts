import { z } from "zod";

const requiredText = (field: string) => z.string({ error: `${field} is required` }).trim().min(1, `${field} is required`);
const positiveInt = (field: string) => z.coerce.number({ error: `${field} must be a number` }).int(`${field} must be a whole number`).positive(`${field} must be greater than zero`);

export const notificationsQuerySchema = z.object({
    limit: z.union([z.coerce.number().int().positive(), z.undefined()]).optional(),
});

export const notificationRouteParamsSchema = z.object({
    id: requiredText("User id"),
    notificationId: positiveInt("Notification id").optional(),
});
