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
    provinceCode: z.string().trim().max(32, "Province code is too long").optional(),
    provinceName: z.string().trim().max(120, "Province name is too long").optional(),
    wardCode: z.string().trim().max(32, "Ward code is too long").optional(),
    wardName: z.string().trim().max(120, "Ward name is too long").optional(),
    latitude: z.number().finite().min(-90).max(90).nullable().optional(),
    longitude: z.number().finite().min(-180).max(180).nullable().optional(),
    isDefault: z.boolean().optional(),
    is_default: z.union([z.boolean(), z.coerce.number()]).optional(),
}).superRefine((data, context) => {
    if (!(data.addressLine || data.address_line || data.address)) {
        context.addIssue({ code: "custom", path: ["addressLine"], message: "Address line is required" });
    }
    const hasLatitude = data.latitude !== undefined && data.latitude !== null;
    const hasLongitude = data.longitude !== undefined && data.longitude !== null;
    if (hasLatitude !== hasLongitude) {
        context.addIssue({ code: "custom", path: [hasLatitude ? "longitude" : "latitude"], message: "A map pin requires both coordinates" });
    }
});
