export const ORDER_STATUS = {
    PENDING: 0,
    DONE: 1,
    CANCELED: 2,
} as const;

export type OrderStatusKey = "pending" | "done" | "canceled" | "unknown";

export const getOrderStatusKey = (status: number): OrderStatusKey => {
    if (status === ORDER_STATUS.PENDING) return "pending";
    if (status === ORDER_STATUS.DONE) return "done";
    if (status === ORDER_STATUS.CANCELED) return "canceled";
    return "unknown";
};
