import { z } from "zod";
import { ORDER_STATUS } from "#src/shared/constants/order-status";
import { PAYMENT_PROVIDER } from "../payments/payment.types";
import { deliveryAddressSchema } from "../shipping/shipping.validator";
import { MAX_LOYALTY_POINTS } from "../loyalty/loyalty.policy";

const requiredText = (field: string) => z.string({ error: `${field} is required` }).trim().min(1, `${field} is required`);
const positiveInt = (field: string) => z.coerce.number({ error: `${field} must be a number` }).int(`${field} must be a whole number`).positive(`${field} must be greater than zero`);
const nonNegativeNumber = (field: string) => z.coerce.number({ error: `${field} must be a number` }).nonnegative(`${field} cannot be negative`);
const loyaltyPoints = z.coerce.number().int().nonnegative().max(MAX_LOYALTY_POINTS).default(0);
const optionalDiscountCode = z.string().trim().min(1, "Discount code cannot be empty").max(50, "Discount code is too long").optional();
const guestPositiveInt = (field: string) => z.number({ error: `${field} must be a number` })
    .int(`${field} must be a whole number`)
    .positive(`${field} must be greater than zero`)
    .refine(Number.isSafeInteger, `${field} must be a safe integer`);
const guestRequiredText = (field: string, max: number) => z.string({ error: `${field} is required` }).trim().min(1, `${field} is required`).max(max, `${field} is too long`);
const guestCartItemSchema = z.object({
    productId: guestPositiveInt("Product id"),
    quantity: guestPositiveInt("Quantity").max(99, "Quantity must not exceed 99"),
}).strict();

const guestContactSchema = z.object({
    email: z.string({ error: "Email must be valid" })
        .trim()
        .toLowerCase()
        .email("Email must be valid")
        .max(255, "Email is too long"),
    name: guestRequiredText("Recipient name", 160),
    phone: z.string().trim().max(40, "Phone number is too long").transform((value) => value || null).optional(),
}).strict();

const guestShippingSchema = z.object({
    address: guestRequiredText("Address", 1000),
    city: guestRequiredText("City", 160),
    country: guestRequiredText("Country", 160),
}).strict();

const guestCheckoutBaseSchema = z.object({
    locale: z.enum(["en", "vi"]).default("en"),
    shippingQuoteId: z.string().uuid(),
    deliveryAddress: deliveryAddressSchema,
    cart: z.array(guestCartItemSchema)
        .min(1, "Cart cannot be empty")
        .max(50, "Cart must not contain more than 50 items"),
    contact: guestContactSchema,
    shipping: guestShippingSchema,
    discountCode: optionalDiscountCode.transform((value) => value?.toUpperCase()),
}).strict();

const validateGuestCartQuantities = (
    data: z.infer<typeof guestCheckoutBaseSchema>,
    context: z.RefinementCtx,
) => {
    const quantities = new Map<number, number>();
    data.cart.forEach((item, index) => {
        const totalQuantity = (quantities.get(item.productId) || 0) + item.quantity;
        quantities.set(item.productId, totalQuantity);
        if (totalQuantity > 99) {
            context.addIssue({
                code: "custom",
                path: ["cart", index, "quantity"],
                message: "Combined quantity for a product must not exceed 99",
            });
        }
    });
};

export const orderStatusSchema = z.object({
    status: z.coerce.number().int().refine((value) => Object.values(ORDER_STATUS).includes(value as (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS]), "Status is required"),
});

export const adminOrdersQuerySchema = z.object({
    page: z.coerce.number().int().min(1).max(1_000_000).default(1),
    limit: z.coerce.number().int().positive().max(100).default(25),
    search: z.string().trim().max(120).default(""),
    status: z.coerce.number().int().min(0).max(2).optional(),
    paymentMethod: z.enum(["cash", "payos", "bank_transfer", "stripe", "card", "none"]).optional(),
    sort: z.enum(["newest", "oldest"]).default("newest"),
});

export const cancelOrderSchema = z.object({
    reason: z.string().trim().max(500, "Cancellation reason is too long").optional(),
});

export const paymentAttemptIdSchema = z.string().uuid();
export const paymentAttemptIdempotencyKeySchema = z.string().uuid();

export const purchaseSchema = z.object({
    locale: z.enum(["en", "vi"]).default("en"),
    shippingQuoteId: z.string().uuid(),
    deliveryAddress: deliveryAddressSchema,
    totalPrice: nonNegativeNumber("Total price"),
    cart: z.array(
        z.object({
            productId: positiveInt("Product id"),
            quantity: positiveInt("Quantity"),
            price: nonNegativeNumber("Price"),
            sale_price: z.union([nonNegativeNumber("Sale price"), z.null(), z.undefined()]).optional(),
        }),
    ).min(1, "Cart cannot be empty"),
    // Kept temporarily for backwards-compatible clients, but checkout logic
    // never trusts this amount. The server recomputes any discount from discountCode.
    discount: nonNegativeNumber("Discount").default(0),
    discountCode: optionalDiscountCode,
    loyaltyPoints,
    shippingAddress: requiredText("Shipping address"),
    paymentMethod: z.enum([PAYMENT_PROVIDER.CASH, PAYMENT_PROVIDER.PAYOS], { error: "Unsupported payment method" }),
});

export const checkoutSessionSchema = z.object({
    locale: z.enum(["en", "vi"]).default("en"),
    shippingQuoteId: z.string().uuid(),
    deliveryAddress: deliveryAddressSchema,
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
    discountCode: optionalDiscountCode,
    loyaltyPoints,
    shippingAddress: requiredText("Shipping address"),
});

export const applyDiscountSchema = z.object({
    discountCode: requiredText("Discount code"),
    price: nonNegativeNumber("Price"),
});

export const guestPurchaseSchema = guestCheckoutBaseSchema.extend({
    paymentMethod: z.enum([PAYMENT_PROVIDER.CASH, PAYMENT_PROVIDER.PAYOS], { error: "Unsupported payment method" }),
}).superRefine(validateGuestCartQuantities);

export const guestPayOSCheckoutSchema = guestCheckoutBaseSchema.extend({
    paymentMethod: z.literal(PAYMENT_PROVIDER.PAYOS),
}).superRefine(validateGuestCartQuantities);

export const guestOrderLookupSchema = z.object({
    orderId: guestPositiveInt("Order id"),
    guestOrderToken: z.string().trim().min(1, "Guest order token is required").max(256, "Guest order token is too long"),
}).strict();

export const guestPayOSOrderLookupSchema = z.object({
    orderCode: guestPositiveInt("PayOS order code"),
    guestOrderToken: z.string().trim().min(1, "Guest order token is required").max(256, "Guest order token is too long"),
}).strict();

export const mockPayOSConfirmSchema = z.object({
    orderCode: guestPositiveInt("PayOS order code"),
    paymentLinkId: z.string().trim().min(1, "PayOS payment link id is required").max(255, "PayOS payment link id is too long"),
    amount: guestPositiveInt("Payment amount"),
}).strict();
