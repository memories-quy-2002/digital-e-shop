import type { PurchasePayload } from "./orders.dto";

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
    category?: string;
    brand?: string;
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
        productName?: string;
        category?: string;
        brand?: string;
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

export type { PurchasePayload };
