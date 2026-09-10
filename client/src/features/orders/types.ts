export type CustomerOrder = {
    id: number;
    date_added: string;
    status: number;
    total_price: number;
    discount: number;
    shipping_address: string;
    payment_method?: "bank_transfer" | "cash" | "payos" | "stripe" | "card" | string;
    currency?: string;
    payment_status?: string | null;
    payment_amount?: number | null;
    payment_currency?: string | null;
    payment_simulated?: boolean | number | null;
};

export type CustomerOrderItem = {
    productId: number;
    productName: string;
    brand: string;
    category: string;
    price: number;
    sale_price: number | null;
    stock: number;
    available_stock?: number;
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

export type CheckoutCartItem = {
    cartItemId: number;
    productId: number;
    productName: string;
    category: string;
    brand: string;
    price: number;
    sale_price: number | null;
    main_image: string;
    quantity: number;
    stock: number;
    available_stock?: number;
};

export type CartValidationIssue = {
    productId?: number;
    cartItemId?: number;
    productName: string;
    requestedQuantity: number;
    availableStock: number;
    reason: "unavailable" | "out_of_stock" | "insufficient_stock";
};

export type GuestCartItemInput = {
    productId: number;
    quantity: number;
};

export type GuestPaymentMethod = "cash" | "bank_transfer" | "payos";
export type GuestCardPaymentMethod = "card" | "stripe";

export type GuestCheckoutContact = {
    email: string;
    name: string;
    phone?: string;
};

export type GuestCheckoutShipping = {
    address: string;
    city: string;
    country: string;
};

export type GuestPurchaseRequest = {
    cart: GuestCartItemInput[];
    contact: GuestCheckoutContact;
    shipping: GuestCheckoutShipping;
    discountCode?: string;
    paymentMethod: GuestPaymentMethod;
};

export type GuestCheckoutSessionRequest = {
    cart: GuestCartItemInput[];
    contact: GuestCheckoutContact;
    shipping: GuestCheckoutShipping;
    discountCode?: string;
    paymentMethod: GuestCardPaymentMethod;
};

export type GuestPayOSCheckoutRequest = Omit<GuestCheckoutSessionRequest, "paymentMethod"> & {
    paymentMethod: "payos";
};

export type GuestOrderItem = {
    productId: number;
    sku?: string | null;
    productName: string;
    category: string;
    brand: string;
    warrantyMonths?: number | null;
    specifications?: string | null;
    price: number;
    sale_price: number | null;
    stock: number;
    main_image: string;
    quantity: number;
    totalPrice: number;
};

export type GuestOrderDetail = {
    id: number;
    date_added: string;
    guest_email: string | null;
    guest_name: string | null;
    guest_phone: string | null;
    status: number;
    total_price: number;
    discount: number;
    shipping_address?: string | null;
    payment_method?: string | null;
    currency?: string | null;
    payment_status?: string | null;
    payment_amount?: number | null;
    payment_currency?: string | null;
    payment_simulated?: boolean | number | null;
    items: GuestOrderItem[];
};

export type GuestPurchaseResponse = {
    orderId: number;
    order: { id: number; date_added: string; total_price?: number; discount?: number };
    guestOrderToken: string;
    paymentMethod: GuestPaymentMethod;
};

export type GuestCheckoutSessionResponse = {
    url: string;
    guestOrderToken: string;
    orderCode?: number;
    paymentLinkId?: string;
    amount?: number;
    currency?: string;
};

export type PayOSCheckoutResponse = Omit<GuestCheckoutSessionResponse, "guestOrderToken"> & {
    guestOrderToken?: string;
};

export type GuestCartPromotionPreview = {
    code: string | null;
    valid: boolean;
    discount: number;
    discountPercent: number | null;
    message?: string;
};

export type GuestCartPreview = {
    valid: boolean;
    cartItems: CheckoutCartItem[];
    issues: CartValidationIssue[];
    merchandiseTotal: number;
    promotion: GuestCartPromotionPreview;
    totalPrice: number;
};

export type CustomerCartValidation = {
    valid: boolean;
    cartItems: CheckoutCartItem[];
    issues: CartValidationIssue[];
};

const normalizeOptionalSalePrice = (value: unknown) => {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
        return null;
    }

    return numericValue;
};

export const normalizeCheckoutCartItems = (items: any[] = []): CheckoutCartItem[] =>
    items.map((item: any) => ({
        cartItemId: Number(item.cart_item_id || item.id || 0),
        productId: Number(item.product_id || 0),
        productName: String(item.product_name || `Product #${item.product_id || 0}`),
        category: String(item.category || "Unavailable"),
        brand: String(item.brand || "Unavailable"),
        price: Number(item.price) || 0,
        sale_price: normalizeOptionalSalePrice(item.sale_price),
        main_image: String(item.main_image || ""),
        quantity: Number(item.quantity) || 0,
        stock: item.stock === null || item.stock === undefined ? 0 : Number(item.stock) || 0,
        available_stock:
            item.available_stock === null || item.available_stock === undefined
                ? (item.stock === null || item.stock === undefined ? 0 : Number(item.stock) || 0)
                : Number(item.available_stock) || 0,
    }));

export const getCartValidationMessage = (issues: CartValidationIssue[]) => {
    const firstIssue = issues[0];
    if (!firstIssue) {
        return "Some cart items are unavailable or exceed current stock.";
    }

    if (firstIssue.reason === "unavailable") {
        return `${firstIssue.productName} is no longer available. Remove it from your cart to continue.`;
    }

    if (firstIssue.reason === "out_of_stock") {
        return `${firstIssue.productName} is out of stock.`;
    }

    return `${firstIssue.productName} has only ${firstIssue.availableStock} item(s) available.`;
};
