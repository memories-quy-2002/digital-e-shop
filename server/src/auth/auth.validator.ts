import { z } from "zod";

const requiredText = (field: string) => z.string({ error: `${field} is required` }).trim().min(1, `${field} is required`);

const firebaseLoginSchema = z.object({
    idToken: requiredText("Firebase ID token"),
    rememberMe: z.boolean().optional().default(false),
}).strict();

const localLoginSchema = z.object({
    email: requiredText("Email").max(255, "Email is too long"),
    password: requiredText("Password"),
    rememberMe: z.boolean().optional().default(false),
}).strict();

export const userLoginSchema = z.union([firebaseLoginSchema, localLoginSchema]);
export type UserLoginInput = z.infer<typeof userLoginSchema>;

export const registerUserSchema = z.object({
    idToken: requiredText("Firebase ID token"),
    user: z.object({
        username: requiredText("Username").min(3, "Username must be at least 3 characters").max(50, "Username is too long"),
    }).strict(),
}).strict();
