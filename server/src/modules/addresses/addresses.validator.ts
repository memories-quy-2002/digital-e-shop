import { z } from "zod";

export const addressSchema = z.object({
    label: z.string().trim().max(80, "Label must be 80 characters or fewer").optional(),
    recipientName: z.string().trim().max(120, "Recipient name is too long").optional(),
    recipient_name: z.string().trim().max(120, "Recipient name is too long").optional(),
    phoneNumber: z.string().trim().max(40, "Phone number is too long").optional(),
    phone_number: z.string().trim().max(40, "Phone number is too long").optional(),
    addressLine: z.string().trim().optional(),
    address_line: z.string().trim().optional(),
    address: z.string().trim().optional(),
    city: z.string().trim().max(120, "City is too long").optional(),
    country: z.string().trim().max(120, "Country is too long").optional(),
    isDefault: z.boolean().optional(),
    is_default: z.union([z.boolean(), z.coerce.number()]).optional(),
}).superRefine((data, context) => {
    if (!(data.addressLine || data.address_line || data.address)) {
        context.addIssue({ code: "custom", path: ["addressLine"], message: "Address line is required" });
    }
});
