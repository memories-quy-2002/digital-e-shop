export const ADMIN_ALERT_TYPE = {
    ORDER: "order",
    PAYMENT: "payment",
    INVENTORY: "inventory",
    SUPPORT: "support",
    CUSTOMER: "customer",
} as const;

export const ADMIN_ALERT_PRIORITY = {
    HIGH: "High",
    MEDIUM: "Medium",
    LOW: "Low",
} as const;

export const ADMIN_ALERT_PRIORITY_SCORE = {
    [ADMIN_ALERT_PRIORITY.HIGH]: 3,
    [ADMIN_ALERT_PRIORITY.MEDIUM]: 2,
    [ADMIN_ALERT_PRIORITY.LOW]: 1,
} as const;

export const ADMIN_ALERT_PRIORITY_SCORE_DEFAULT = 0;

export type AdminAlertType = (typeof ADMIN_ALERT_TYPE)[keyof typeof ADMIN_ALERT_TYPE];
export type AdminAlertPriority = (typeof ADMIN_ALERT_PRIORITY)[keyof typeof ADMIN_ALERT_PRIORITY];

export type AdminAlert = {
    id: string;
    type: AdminAlertType;
    title: string;
    description: string;
    createdAt: string;
    priority: AdminAlertPriority;
    actionLabel: string;
    route: string;
    unread: boolean;
};
