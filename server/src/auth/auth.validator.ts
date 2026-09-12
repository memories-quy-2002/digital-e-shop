import { z } from "zod";

const requiredText = (field: string) => z.string({ error: `${field} is required` }).trim().min(1, `${field} is required`);

const firebaseLoginSchema = z.object({
    idToken: requiredText("Firebase ID token"),
    rememberMe: z.boolean().optional().default(false),
}).strict();

export const userLoginSchema = firebaseLoginSchema;
export type UserLoginInput = z.infer<typeof firebaseLoginSchema>;

const registrationUserSchema = z.object({
    username: requiredText("Username").min(3, "Username must be at least 3 characters").max(50, "Username is too long"),
}).strict();

const firebaseRegisterSchema = z.object({
    idToken: requiredText("Firebase ID token"),
    user: registrationUserSchema,
}).strict();

export const registerUserSchema = firebaseRegisterSchema;
export type RegisterUserRequest = z.infer<typeof firebaseRegisterSchema>;
