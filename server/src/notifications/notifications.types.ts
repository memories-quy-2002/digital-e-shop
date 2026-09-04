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
