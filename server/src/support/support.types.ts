export const SUPPORT_STATUS = {
    OPEN: "OPEN",
    IN_PROGRESS: "IN_PROGRESS",
    WAITING_FOR_CUSTOMER: "WAITING_FOR_CUSTOMER",
    RESOLVED: "RESOLVED",
    CLOSED: "CLOSED",
} as const;

export const SUPPORT_STATUSES = [
    SUPPORT_STATUS.OPEN,
    SUPPORT_STATUS.IN_PROGRESS,
    SUPPORT_STATUS.WAITING_FOR_CUSTOMER,
    SUPPORT_STATUS.RESOLVED,
    SUPPORT_STATUS.CLOSED,
] as const;

export const SUPPORT_PRIORITY = {
    LOW: "LOW",
    NORMAL: "NORMAL",
    HIGH: "HIGH",
    URGENT: "URGENT",
} as const;

export const SUPPORT_PRIORITIES = [
    SUPPORT_PRIORITY.LOW,
    SUPPORT_PRIORITY.NORMAL,
    SUPPORT_PRIORITY.HIGH,
    SUPPORT_PRIORITY.URGENT,
] as const;
export const SUPPORT_DEFAULT_CATEGORY = "general";

export type SupportStatus = (typeof SUPPORT_STATUSES)[number];
export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number];

export type CreateSupportTicketInput = {
    subject: string;
    message: string;
    category?: string;
    orderId?: number;
};

export type UpdateSupportTicketInput = {
    status?: SupportStatus;
    priority?: SupportPriority;
    adminNote?: string;
};

export type SupportTicket = {
    id: number;
    user_id: string;
    order_id: number | null;
    category: string;
    subject: string;
    message: string;
    status: SupportStatus;
    priority: SupportPriority;
    admin_note: string | null;
    created_at: string;
    updated_at: string;
};
