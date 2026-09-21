export type CustomerNotificationRow = {
    id: number;
    user_id: string;
    type: string;
    title: string;
    message: string;
    link?: string | null;
    metadata?: string | Record<string, unknown> | null;
    alert_event_id?: number | null;
    read_at?: string | null;
    created_at?: string;
};
