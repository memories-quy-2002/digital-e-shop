export const CUSTOMER_ROUTES = {
    account: "/account",
    orders: "/account/orders",
    addresses: "/account/addresses",
    notifications: "/account/notifications",
} as const;

export const customerOrderRoute = (orderId?: number | string) => {
    if (orderId === undefined || orderId === null) return CUSTOMER_ROUTES.orders;
    return CUSTOMER_ROUTES.orders + "?order=" + encodeURIComponent(String(orderId));
};
