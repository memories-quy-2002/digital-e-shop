export const SUPPORT_STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_FOR_CUSTOMER", "RESOLVED", "CLOSED"] as const;
export const SUPPORT_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

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
