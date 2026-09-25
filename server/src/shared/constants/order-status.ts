export const ORDER_STATUS = {
    PENDING: 0,
    DONE: 1,
    CANCELED: 2,
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];
