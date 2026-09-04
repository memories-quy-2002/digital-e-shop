import type { CartCheckoutItem } from "./cart.dto";

export type CartItemRow = {
    id?: number;
    cart_item_id?: number;
    product_id?: number;
    product_name?: string;
    brand?: string | null;
    category?: string | null;
    price?: number | null;
    sale_price?: number | null;
    main_image?: string | null;
    quantity?: number;
    stock?: number | null;
    [key: string]: unknown;
};

export type CartRow = {
    id: number;
    user_id?: string;
    stock?: number;
    [key: string]: unknown;
};

export type CheckoutUnitPrice = {
    price: number;
    sale_price: number | null;
};

export type CartValidationIssue = {
    cartItemId: number;
    productId: number;
    productName: string;
    requestedQuantity: number;
    availableStock: number;
    reason: "unavailable" | "out_of_stock" | "insufficient_stock";
};

export type CartValidationResult = {
    valid: boolean;
    cartItems: CartItemRow[];
    issues: CartValidationIssue[];
};

export type CheckoutMismatch = {
    productId: number;
    productName: string;
    reason: "missing_item" | "unexpected_item" | "quantity_changed" | "price_changed" | "total_changed";
    submittedQuantity?: number;
    authoritativeQuantity?: number;
    submittedUnitPrice?: number;
    authoritativeUnitPrice?: number;
    submittedTotalPrice?: number;
    authoritativeTotalPrice?: number;
};

export type CheckoutValidationResult = CartValidationResult & {
    mismatches: CheckoutMismatch[];
    authoritativeTotalPrice: number;
};

export type { CartCheckoutItem };
