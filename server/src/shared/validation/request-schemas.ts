import { z } from "zod";

export {
    cartAddItemSchema,
    cartDeleteItemSchema,
    cartUpdateQuantitySchema,
} from "../../cart/cart.validator";
export { promotionSchema } from "../../promotions/promotions.validator";
export { addressSchema } from "../../addresses/addresses.validator";
export { adminUserUpdateSchema } from "../../users/users.validator";
export {
    orderStatusSchema,
    purchaseSchema,
    applyDiscountSchema,
} from "../../orders/orders.validator";
export {
    productCreateSchema,
    productUpdateSchema,
    inventoryUpdateSchema,
} from "../../products/products.validator";
export {
    userLoginSchema,
    registerUserSchema,
} from "../../auth/auth.validator";

export const parseBody = <T extends z.ZodType>(schema: T, body: unknown): z.infer<T> => schema.parse(body);

export const getValidationMessage = (error: unknown) => {
    if (error instanceof z.ZodError) {
        return error.issues.map((issue) => issue.message).join("; ");
    }

    return "Invalid request payload";
};
