export type CustomerOrder = {
    id: number;
    date_added: string;
    status: number;
    total_price: number;
    discount: number;
    shipping_address: string;
    payment_method?: "bank_transfer" | "cash";
};

export type CustomerOrderItem = {
    productId: number;
    productName: string;
    brand: string;
    category: string;
    price: number;
    sale_price: number | null;
    stock: number;
    quantity: number;
    totalPrice: number;
};

export type CustomerOrderTimelineEvent = {
    id: number;
    label: string;
    note: string | null;
    created_at: string | null;
    status: number;
};

export type CustomerOrderDetail = CustomerOrder & {
    items: CustomerOrderItem[];
    timeline?: CustomerOrderTimelineEvent[];
};
