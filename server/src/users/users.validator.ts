import { z } from "zod";
import { USER_ACCOUNT_STATUS, USER_ROLE } from "#src/shared/constants/user";

const roleSchema = z.enum([USER_ROLE.CUSTOMER, USER_ROLE.ADMIN]);
const accountStatusSchema = z.enum([USER_ACCOUNT_STATUS.ACTIVE, USER_ACCOUNT_STATUS.SUSPENDED]);

export const adminUserUpdateSchema = z.object({
    role: roleSchema,
    status: accountStatusSchema,
});
