import { z } from "zod";
import { USER_ACCOUNT_STATUS, USER_ROLE } from "#src/shared/constants/user";

const roleSchema = z.enum([USER_ROLE.CUSTOMER, USER_ROLE.ADMIN]);
const accountStatusSchema = z.enum([USER_ACCOUNT_STATUS.ACTIVE, USER_ACCOUNT_STATUS.SUSPENDED]);

export const adminUserUpdateSchema = z.object({
    role: roleSchema,
    status: accountStatusSchema,
    reason: z.string().trim().min(8, "Provide a reason with at least 8 characters").max(500, "Reason cannot exceed 500 characters"),
});

export const adminUsersQuerySchema = z.object({
    page: z.coerce.number().int().min(1).max(1_000_000).default(1),
    limit: z.coerce.number().int().positive().max(100).default(25),
    search: z.string().trim().max(120).default(""),
    role: roleSchema.optional(),
    status: accountStatusSchema.optional(),
});
