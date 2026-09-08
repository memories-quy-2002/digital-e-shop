import type { PurchasePayload } from "./orders.dto";
import type { CartItemRow } from "../cart/cart.types";

export type OrderSummaryRow = {
    id: number;
    user_id: string | null;
    guest_email?: string | null;
    guest_name?: string | null;
    guest_phone?: string | null;
    guest_order_token_hash?: string | null;
    status: number;
    total_price: number;
    discount: number;
    date_added: string;
    currency?: string;
    inventory_restored_at?: string | Date | null;
    cancellation_reason?: string | null;
    payment_status?: string | null;
    payment_amount?: number | null;
    payment_currency?: string | null;
    payment_simulated?: boolean | number | null;
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
    currency?: string;
    payment_status?: string | null;
    payment_amount?: number | null;
    payment_currency?: string | null;
    payment_simulated?: boolean | number | null;
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
    user_id: string | null;
    guest_email?: string | null;
    guest_name?: string | null;
    guest_phone?: string | null;
    customer_name?: string;
    customer_email?: string;
    status: number;
    total_price: number;
    discount: number;
    shipping_address?: string;
    payment_method?: string;
    currency?: string;
    payment_status?: string | null;
    payment_amount?: number | null;
    payment_currency?: string | null;
    payment_simulated?: boolean | null;
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
    user_id: string | null;
    guest_email: string | null;
    guest_name: string | null;
    guest_phone: string | null;
    guest_order_token_hash: string | null;
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

export type GuestContactSnapshot = {
    guestEmail: string;
    guestName: string;
    guestPhone?: string | null;
};

export type AuthenticatedOrderIdentity = {
    kind: "authenticated";
    userId: string;
};

export type GuestOrderIdentity = {
    kind: "guest";
    userId: null;
    guestContact: GuestContactSnapshot;
    guestOrderTokenHash: string;
};

export type OrderIdentity = AuthenticatedOrderIdentity | GuestOrderIdentity;

type CheckoutReservationInputBase = {
    authoritativeCart: CartItemRow[];
    authoritativeTotalPrice: number;
    discount: number;
    discountCode?: string;
    shippingAddress: string;
    databaseExpiresAt?: Date;
};

export type CheckoutReservationInput = CheckoutReservationInputBase & (
    | { uid: string; identity?: never }
    | { identity: OrderIdentity; uid?: never }
);

export type PendingCheckoutInsertInput = {
    reservationToken: string;
    userId: string | null;
    guestEmail: string | null;
    guestName: string | null;
    guestPhone: string | null;
    guestOrderTokenHash: string | null;
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
    user_id: string | null;
    date_added: string;
    payment_method: string;
};

export type { PurchasePayload };
