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

const registrationUserSchema = z.object({
    username: requiredText("Username").min(3, "Username must be at least 3 characters").max(50, "Username is too long"),
}).strict();

const firebaseRegisterSchema = z.object({
    idToken: requiredText("Firebase ID token"),
    user: registrationUserSchema,
}).strict();

const localRegisterSchema = z.object({
    email: requiredText("Email").max(255, "Email is too long").email("Invalid email format"),
    password: requiredText("Password").min(8, "Password must be at least 8 characters"),
    user: registrationUserSchema,
}).strict();

export const registerUserSchema = z.union([firebaseRegisterSchema, localRegisterSchema]);
export type RegisterUserRequest = z.infer<typeof registerUserSchema>;

export const verificationResendSchema = z.object({
    email: requiredText("Email").max(255, "Email is too long").email("Invalid email format"),
}).strict();

export const verificationConfirmSchema = z.object({
    token: requiredText("Verification token").max(512, "Verification token is too long"),
}).strict();

export const passwordResetRequestSchema = z.object({
    email: requiredText("Email").max(255, "Email is too long").email("Invalid email format"),
}).strict();

export const passwordResetConfirmSchema = z.object({
    token: requiredText("Password reset token").max(512, "Password reset token is too long"),
    newPassword: requiredText("New password").min(8, "Password must be at least 8 characters"),
}).strict();

export const emailChangeRequestSchema = z.object({
    email: requiredText("Email").max(255, "Email is too long").email("Invalid email format"),
}).strict();

export const emailChangeConfirmSchema = z.object({
    token: requiredText("Email-change token").max(512, "Email-change token is too long"),
}).strict();
