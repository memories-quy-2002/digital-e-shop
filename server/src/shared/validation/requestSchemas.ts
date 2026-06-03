import { z } from "zod";

const requiredText = (field: string) => z.string({ error: `${field} is required` }).trim().min(1, `${field} is required`);
const positiveInt = (field: string) => z.coerce.number({ error: `${field} must be a number` }).int(`${field} must be a whole number`).positive(`${field} must be greater than zero`);
const nonNegativeNumber = (field: string) => z.coerce.number({ error: `${field} must be a number` }).nonnegative(`${field} cannot be negative`);
const optionalDateTime = z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => (typeof value === "string" ? value.trim() : value))
    .refine((value) => !value || !Number.isNaN(new Date(value).getTime()), "Date must be valid")
    .transform((value) => value || null);

const roleSchema = z.enum(["Customer", "Admin"]);
const accountStatusSchema = z.enum(["Active", "Suspended"]);

export const cartAddItemSchema = z.object({
    pid: positiveInt("Product id"),
    uid: requiredText("User id"),
    quantity: positiveInt("Quantity"),
});

export const cartDeleteItemSchema = z.object({
    cartItemId: positiveInt("Cart item id"),
});

export const cartUpdateQuantitySchema = z.object({
    cartItemId: positiveInt("Cart item id"),
    quantity: positiveInt("Quantity"),
});

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

export const adminUserUpdateSchema = z.object({
    role: roleSchema,
    status: accountStatusSchema,
});

export const orderStatusSchema = z.object({
    status: z.coerce.number().int().refine((value) => [0, 1, 2].includes(value), "Status is required"),
});

export const purchaseSchema = z.object({
    totalPrice: nonNegativeNumber("Total price"),
    cart: z.array(
        z.object({
            productId: positiveInt("Product id"),
            quantity: positiveInt("Quantity"),
            price: nonNegativeNumber("Price"),
            sale_price: z.union([nonNegativeNumber("Sale price"), z.null(), z.undefined()]).optional(),
        }),
    ).min(1, "Cart cannot be empty"),
    discount: nonNegativeNumber("Discount").default(0),
    shippingAddress: requiredText("Shipping address"),
    paymentMethod: z.enum(["bank_transfer", "cash"], { error: "Unsupported payment method" }),
});

export const applyDiscountSchema = z.object({
    discountCode: requiredText("Discount code"),
    price: nonNegativeNumber("Price"),
});

export const productCreateSchema = z.object({
    name: requiredText("Product name"),
    description: z.string().trim().optional().default(""),
    category: requiredText("Category"),
    brand: requiredText("Brand"),
    specifications: z.string().trim().optional().default(""),
    price: nonNegativeNumber("Price"),
    inventory: z.coerce.number({ error: "Inventory must be a number" }).int("Inventory must be a whole number").nonnegative("Inventory cannot be negative"),
    imageUrl: z.string().trim().optional(),
});

export const productUpdateSchema = z.object({
    name: requiredText("Product name").optional(),
    description: z.string().trim().optional(),
    category: requiredText("Category").optional(),
    brand: requiredText("Brand").optional(),
    specifications: z.string().trim().optional(),
    price: nonNegativeNumber("Price").optional(),
    salePrice: z.union([nonNegativeNumber("Sale price"), z.literal(""), z.null(), z.undefined()]).optional(),
    stock: z.coerce.number({ error: "Stock must be a number" }).int("Stock must be a whole number").nonnegative("Stock cannot be negative").optional(),
});

export const inventoryUpdateSchema = z.object({
    stock: z.coerce.number({ error: "Stock must be a number" }).int("Stock must be a whole number").nonnegative("Stock cannot be negative"),
});

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

export const parseBody = <T extends z.ZodType>(schema: T, body: unknown): z.infer<T> => schema.parse(body);

export const getValidationMessage = (error: unknown) => {
    if (error instanceof z.ZodError) {
        return error.issues.map((issue) => issue.message).join("; ");
    }

    return "Invalid request payload";
};
