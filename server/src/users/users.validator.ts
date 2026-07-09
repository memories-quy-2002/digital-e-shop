import { z } from "zod";

const roleSchema = z.enum(["Customer", "Admin"]);
const accountStatusSchema = z.enum(["Active", "Suspended"]);

export const adminUserUpdateSchema = z.object({
    role: roleSchema,
    status: accountStatusSchema,
});
