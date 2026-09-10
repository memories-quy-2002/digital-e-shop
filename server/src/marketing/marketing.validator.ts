import { z } from "zod";

const requiredText = (field: string) => z.string({ error: `${field} is required` }).trim().min(1, `${field} is required`);

export const marketingSubscribeSchema = z.object({
    email: requiredText("Email").max(255, "Email is too long").email("Email must be valid"),
    source: z.string().trim().max(40).optional().default("footer"),
}).strict();

export const marketingUnsubscribeSchema = z.object({
    token: requiredText("Unsubscribe token").max(512, "Unsubscribe token is too long"),
}).strict();
