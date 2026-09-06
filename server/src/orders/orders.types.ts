import type { PurchasePayload } from "./orders.dto";
import type { CartItemRow } from "../cart/cart.types";

export type OrderSummaryRow = {
    id: number;
    user_id: string;
    status: number;
    total_price: number;
    discount: number;
    date_added: string;
};

export type LockedProductRow = {
    id: number;
    name?: string | null;
    stock: number;
};

export type OrderDetailRow = OrderSummaryRow & {
    customer_name?: string;
    customer_email?: string;
    shipping_address?: string;
    payment_method?: string;
    order_item_id?: number;
    product_id?: number;
    product_name?: string;
    sku?: string | null;
    category?: string;
    brand?: string;
    warranty_months?: number | null;
    specifications?: Record<string, unknown> | string | null;
    price?: number;
    sale_price?: number | null;
    stock?: number;
    main_image?: string;
    quantity?: number;
    item_total_price?: number;
};

export type OrderDetail = {
    id: number;
    date_added: string;
    user_id: string;
    customer_name?: string;
    customer_email?: string;
    status: number;
    total_price: number;
    discount: number;
    shipping_address?: string;
    payment_method?: string;
    items: Array<{
        id?: number;
        productId?: number;
        sku?: string | null;
        productName?: string;
        category?: string;
        brand?: string;
        warrantyMonths?: number | null;
        specifications?: Record<string, unknown> | string | null;
        price: number;
        sale_price: number | null;
        stock: number;
        main_image?: string;
        quantity: number;
        totalPrice: number;
    }>;
};

export type OrderTimelineRow = {
    id: number;
    order_id: number;
    status: number;
    label: string;
    note?: string | null;
    actor_id?: string | number | null;
    created_at?: string | null;
};

export type OrderTimelineInput = {
    orderId: number;
    status: number;
    note?: string | null;
    actorId?: string | number | null;
};

export type PendingCheckoutRow = {
    id: number;
    stripe_session_id: string | null;
    reservation_token: string;
    user_id: string;
    cart_json: string;
    total_price: string;
    discount: string;
    shipping_address: string;
    status: "PENDING" | "CONSUMED" | "RELEASED" | "EXPIRED" | string;
    expires_at: string | Date;
    discount_id?: number | null;
    created_at: string;
    consumed_at: string | null;
};

export type OrderItemSnapshot = {
    productId: number;
    sku: string;
    productName: string;
    image: string | null;
    unitPrice: number;
    brand: string;
    category: string;
    warrantyMonths: number | null;
    specifications: Record<string, unknown>;
    quantity: number;
};

export type ReservedQuantityRow = {
    product_id: number;
    reserved_quantity: number | string | null;
};

export type CheckoutReservationItem = {
    productId: number;
    quantity: number;
};

export type CheckoutReservationInput = {
    uid: string;
    authoritativeCart: CartItemRow[];
    authoritativeTotalPrice: number;
    discount: number;
    discountCode?: string;
    shippingAddress: string;
    databaseExpiresAt?: Date;
};

export type PendingCheckoutInsertInput = {
    reservationToken: string;
    userId: string;
    cartJson: string;
    totalPrice: number;
    discount: number;
    shippingAddress: string;
    expiresAt: Date;
};

export type CheckoutReservation = {
    pendingCheckoutId: number;
    reservationToken: string;
    expiresAt: Date;
    cartSnapshot: CartItemRow[];
    pricingSnapshot: {
        totalPrice: number;
        discount: number;
    };
    shippingAddress: string;
    items: CheckoutReservationItem[];
};

export type OrderBySessionRow = {
    id: number;
    user_id: string;
    date_added: string;
    payment_method: string;
};

export type { PurchasePayload };
