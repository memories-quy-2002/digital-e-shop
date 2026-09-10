export type MarketingSubscriptionRow = {
    id: number;
    email: string;
    status: "ACTIVE" | "UNSUBSCRIBED" | string;
    unsubscribe_token_hash?: string | null;
    source?: string | null;
    subscribed_at?: string | Date | null;
    unsubscribed_at?: string | Date | null;
};
