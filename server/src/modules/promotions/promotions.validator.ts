import { z } from "zod";

const requiredText = (field: string) => z.string({ error: `${field} is required` }).trim().min(1, `${field} is required`);
const optionalDateTime = z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => (typeof value === "string" ? value.trim() : value))
    .refine((value) => !value || !Number.isNaN(new Date(value).getTime()), "Date must be valid")
    .transform((value) => value || null);

export const promotionSchema = z
    .object({
        discountCode: requiredText("Promotion code").optional(),
        discount_code: requiredText("Promotion code").optional(),
        discountPercent: z.coerce.number().optional(),
        discount_percent: z.coerce.number().optional(),
        minOrderValue: z.coerce.number().optional(),
        min_order_value: z.coerce.number().optional(),
        usageLimit: z.union([z.coerce.number().int().positive(), z.literal(""), z.null(), z.undefined()]).optional(),
        usage_limit: z.union([z.coerce.number().int().positive(), z.literal(""), z.null(), z.undefined()]).optional(),
        startsAt: optionalDateTime.optional(),
        starts_at: optionalDateTime.optional(),
        expiresAt: optionalDateTime.optional(),
        expires_at: optionalDateTime.optional(),
        active: z.union([z.boolean(), z.coerce.number(), z.string()]).optional(),
    })
    .superRefine((data, context) => {
        const code = data.discountCode || data.discount_code;
        const percent = Number(data.discountPercent ?? data.discount_percent);
        const minOrder = Number(data.minOrderValue ?? data.min_order_value ?? 0);
        const startsAt = data.startsAt ?? data.starts_at;
        const expiresAt = data.expiresAt ?? data.expires_at;

        if (!code) {
            context.addIssue({ code: "custom", path: ["discountCode"], message: "Promotion code is required" });
        }

        if (Number.isNaN(percent) || percent <= 0 || percent > 90) {
            context.addIssue({ code: "custom", path: ["discountPercent"], message: "Discount percent must be between 1 and 90" });
        }

        if (Number.isNaN(minOrder) || minOrder < 0) {
            context.addIssue({ code: "custom", path: ["minOrderValue"], message: "Minimum order cannot be negative" });
        }

        if (startsAt && expiresAt && new Date(expiresAt) <= new Date(startsAt)) {
            context.addIssue({ code: "custom", path: ["expiresAt"], message: "Expiry date must be after the start date" });
        }
    });
