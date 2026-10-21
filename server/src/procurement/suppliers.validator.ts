import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((value) => value || undefined);
const version = z.number().int().positive().max(2_147_483_647);

export const supplierFieldsSchema = z.object({
    code: z.string().trim().min(1).max(64).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/).transform((value) => value.toUpperCase()),
    name: z.string().trim().min(1).max(160),
    contactName: optionalText(120),
    email: z.union([z.literal(""), z.string().trim().email().max(254)]).optional().transform((value) => value || undefined),
    phone: optionalText(40),
    address: optionalText(500),
    notes: optionalText(2000),
}).strict();

export const createSupplierSchema = supplierFieldsSchema;
export const updateSupplierSchema = supplierFieldsSchema.partial().extend({ version }).strict().refine(
    (input) => Object.keys(input).some((key) => key !== "version"),
    { message: "At least one supplier field must be changed" },
);
export const supplierActionSchema = z.object({ version, reason: z.string().trim().min(8).max(500) }).strict();
export const supplierIdSchema = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const suppliersQuerySchema = z.object({
    page: z.coerce.number().int().positive().max(1_000_000).default(1),
    limit: z.coerce.number().int().positive().max(100).default(25),
    search: z.string().trim().max(120).optional().default(""),
    status: z.enum(["active", "archived", "all"]).default("active"),
}).strict();
