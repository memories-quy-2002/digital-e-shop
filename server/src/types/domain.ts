export type DbError = Error & {
    code?: string;
    sqlMessage?: string;
};

export type QueryCallback<T = unknown> = (err?: DbError | null, results?: T, fields?: unknown) => void;

export type QueryParams = unknown[] | Record<string, unknown> | QueryCallback | undefined;

export type LooseRecord = Record<string, unknown>;
export type AppRequestMap = Record<string, unknown>;

export type AppUser = {
    id?: string;
    role?: string;
    [key: string]: unknown;
};

export type AppRequest = {
    user?: AppUser;
    file?: UploadedFile;
    body: AppRequestMap;
    cookies: AppRequestMap;
    headers: AppRequestMap;
    ip?: string;
    method: string;
    params: AppRequestMap;
    path: string;
    query: AppRequestMap;
    url: string;
};

export type AppResponse = {
    clearCookie(name: string, options?: AppCookieOptions): AppResponse;
    cookie(name: string, value: unknown, options?: AppCookieOptions): AppResponse;
    header(name: string, value: string): AppResponse;
    send(body?: unknown): AppResponse;
    sendFile(path: string): void;
    sendStatus(code: number): AppResponse;
    status(code: number): AppResponse;
    json(body?: unknown): AppResponse;
};

export type AppNextFunction = (err?: unknown) => void;

export type AppCookieOptions = {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: boolean | "lax" | "strict" | "none";
    maxAge?: number;
    path?: string;
};

export type InsertResult = {
    insertId: number;
    affectedRows?: number;
};

export type UpdateResult = {
    affectedRows: number;
};

export type CountRow = {
    total: number;
};

export type IdNameRow = {
    id: number;
    name?: string;
};

export type CartCheckoutItem = {
    productId: number;
    quantity: number;
    price: number;
    sale_price?: number | null;
};

export type PurchasePayload = {
    totalPrice: number;
    cart: CartCheckoutItem[];
    discount: number;
    shippingAddress: string;
    paymentMethod: string;
};

export type LockedProductRow = {
    id: number;
    stock: number;
};

export type InventoryMovementInput = {
    productId: number;
    orderId?: number | null;
    movementType: string;
    quantityChange: number;
    stockBefore?: number | null;
    stockAfter?: number | null;
    note?: string | null;
    actorId?: string | number | null;
};

export type InventoryMovementRow = {
    id: number;
    product_id: number;
    product_name?: string | null;
    order_id?: number | null;
    movement_type: string;
    quantity_change: number;
    stock_before?: number | null;
    stock_after?: number | null;
    note?: string | null;
    actor_id?: string | number | null;
    created_at?: string | null;
};

export type OrderSummaryRow = {
    id: number;
    user_id: string;
    status: number;
    total_price: number;
    discount: number;
    date_added: string;
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

export type PromotionPayload = {
    discountCode: string;
    discountPercent: number;
    active: 0 | 1;
    minOrderValue: number;
    startsAt: string | null;
    expiresAt: string | null;
    usageLimit: number | null;
};

export type PromotionRow = {
    id: number;
    discount_code: string;
    discount_percent: number;
    active?: number | boolean;
    min_order_value?: number;
    starts_at?: string | null;
    expires_at?: string | null;
    usage_limit?: number | null;
};

export type PromotionInput = {
    id?: number | string;
    discountCode?: string;
    discount_code?: string;
    discountPercent?: number | string;
    discount_percent?: number | string;
    active?: boolean | number | string;
    minOrderValue?: number | string;
    min_order_value?: number | string;
    startsAt?: string | null;
    starts_at?: string | null;
    expiresAt?: string | null;
    expires_at?: string | null;
    usageLimit?: number | string | null;
    usage_limit?: number | string | null;
};

export type ProductCreateInput = {
    name: string;
    description: string;
    category: string;
    brand: string;
    specifications?: string;
    price: number | string;
    inventory: number | string;
    imageUrl?: string;
};

export type ProductUpdateInput = Partial<{
    name: string;
    description: string;
    category: string;
    brand: string;
    specifications: string;
    price: number | string;
    salePrice: number | string | null;
    stock: number | string;
    actorId: string | number;
}>;

export type ProductEditorRow = {
    id: number;
    name: string;
    description?: string | null;
    category: string;
    brand: string;
    price: number;
    sale_price?: number | null;
    stock: number;
    specifications?: string | null;
    main_image?: string;
    rating?: number;
    reviews?: number;
};

export type UploadedFile = {
    buffer: Buffer;
};

export type CartRow = {
    id: number;
    user_id?: string;
    stock?: number;
    [key: string]: unknown;
};

export type CartItemRow = {
    id?: number;
    cart_item_id?: number;
    product_id?: number;
    product_name?: string;
    quantity?: number;
    stock?: number;
    [key: string]: unknown;
};

export type CartValidationIssue = {
    cartItemId: number;
    productId: number;
    productName: string;
    requestedQuantity: number;
    availableStock: number;
    reason: "out_of_stock" | "insufficient_stock";
};

export type CartValidationResult = {
    valid: boolean;
    cartItems: CartItemRow[];
    issues: CartValidationIssue[];
};

export type WishlistRow = {
    id?: number;
    user_id?: string;
    product_id?: number;
    [key: string]: unknown;
};

export type ReviewRow = {
    id?: number;
    product_id?: number;
    user_id?: string;
    rating?: number;
    comment?: string;
    verified_purchase?: number | boolean;
    [key: string]: unknown;
};

export type RatingSummaryRow = {
    total?: number;
    average?: number;
    five?: number;
    four?: number;
    three?: number;
    two?: number;
    one?: number;
};

export type CustomerAddressInput = {
    label?: string;
    recipientName?: string;
    recipient_name?: string;
    phoneNumber?: string;
    phone_number?: string;
    addressLine?: string;
    address_line?: string;
    address?: string;
    city?: string;
    country?: string;
    isDefault?: boolean | number;
    is_default?: boolean | number;
};

export type CustomerAddressRow = {
    id: number;
    user_id: string;
    label: string;
    recipient_name?: string | null;
    phone_number?: string | null;
    address_line: string;
    city?: string | null;
    country?: string | null;
    is_default?: number | boolean;
    created_at?: string;
    updated_at?: string;
};

export type CustomerNotificationRow = {
    id: number;
    user_id: string;
    type: string;
    title: string;
    message: string;
    link?: string | null;
    read_at?: string | null;
    created_at?: string;
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

export type UserRow = {
    id: string;
    email?: string;
    username?: string;
    first_name?: string | null;
    last_name?: string | null;
    role?: string;
    status?: string;
    refresh_token?: string | null;
    [key: string]: unknown;
};

export type CustomerProfileRow = UserRow & {
    order_count?: number;
    total_spent?: number;
    wishlist_count?: number;
};

export type CustomerRecentOrderRow = {
    id: number;
    total_price: number;
    discount: number;
    status?: number;
    date_added?: string;
    [key: string]: unknown;
};

export type SessionRow = {
    id: number;
    session_start?: string | Date | null;
    [key: string]: unknown;
};

export type ServiceResultMessage = string;
