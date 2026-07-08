import { z } from "zod";

const requiredText = (field: string) => z.string({ error: `${field} is required` }).trim().min(1, `${field} is required`);
const roleSchema = z.enum(["Customer", "Admin"]);

export const userLoginSchema = z.object({
    uid: requiredText("User id"),
    role: roleSchema,
    rememberMe: z.boolean().optional().default(false),
});

export const registerUserSchema = z.object({
    uid: requiredText("User id"),
    user: z.object({
        username: requiredText("Username").min(3, "Username must be at least 3 characters").max(50, "Username is too long"),
        email: z.email("Email must be valid"),
        password: requiredText("Password").min(8, "Password must be at least 8 characters"),
        role: roleSchema,
    }),
});
