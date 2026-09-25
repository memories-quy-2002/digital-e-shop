import http from "../../lib/http";
import type { SupportPriority, SupportStatus } from "./constants";

export type SupportTicket = {
    id: number;
    user_id?: string;
    order_id?: number | null;
    category: string;
    subject: string;
    message: string;
    status: SupportStatus;
    priority: SupportPriority;
    admin_note?: string | null;
    created_at: string;
    updated_at: string;
};

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

export async function createSupportTicket(input: CreateSupportTicketInput): Promise<SupportTicket> {
    const response = await http.post("/api/support/tickets", input);
    return response.data.ticket;
}

export async function fetchSupportTickets(status?: SupportStatus): Promise<SupportTicket[]> {
    const response = await http.get(status ? `/api/support/tickets?status=${encodeURIComponent(status)}` : "/api/support/tickets");
    return response.data.tickets || [];
}

export async function updateSupportTicket(id: number, input: UpdateSupportTicketInput): Promise<SupportTicket> {
    const response = await http.patch(`/api/support/tickets/${id}`, input);
    return response.data.ticket;
}
