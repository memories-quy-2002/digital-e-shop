export type AdminOrder = {
    id: number;
    date_added: Date;
    user_id: string;
    customer_name?: string;
    customer_email?: string;
    status: number;
    total_price: number;
    discount: number;
    shipping_address: string;
    payment_method?: "bank_transfer" | "cash";
};

export type AdminOrderDetail = AdminOrder & {
    items: Array<{
        productId: number;
        productName: string;
        brand: string;
        category: string;
        price: number;
        sale_price: number | null;
        quantity: number;
        totalPrice: number;
    }>;
    timeline?: Array<{
        id: number;
        label: string;
        note: string | null;
        created_at: string | null;
        status: number;
    }>;
};

export type AdminOrderItem = {
    id: number;
    name: string;
    price: number;
    order_id: number;
    sales: number;
    revenue: number;
};

export type AdminAccount = {
    id: string;
    email: string;
    username: string;
    first_name: string | null;
    last_name: string | null;
    role: string;
    status?: "Active" | "Suspended";
    order_count?: number;
    created_at: Date;
};

export type AdminCustomerProfile = AdminAccount & {
    total_spent: number;
    wishlist_count: number;
    last_order_at: string | null;
    recent_orders: Array<{
        id: number;
        date_added: string;
        status: number;
        total_price: number;
        discount: number;
        payment_method?: string;
    }>;
};
