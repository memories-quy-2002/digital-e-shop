import { z } from "zod";

const requiredText = (field: string) => z.string({ error: `${field} is required` }).trim().min(1, `${field} is required`);

export const userLoginSchema = z.object({
    idToken: requiredText("Firebase ID token"),
    rememberMe: z.boolean().optional().default(false),
}).strict();

export const registerUserSchema = z.object({
    idToken: requiredText("Firebase ID token"),
    user: z.object({
        username: requiredText("Username").min(3, "Username must be at least 3 characters").max(50, "Username is too long"),
    }).strict(),
}).strict();
