export type UserRow = {
    id: string;
    email?: string;
    username?: string;
    first_name?: string | null;
    last_name?: string | null;
    role?: string;
    status?: string;
    auth_provider?: string | null;
    provider_user_id?: string | null;
    email_verified_at?: string | Date | null;
    email_verification_token_hash?: string | null;
    email_verification_expires_at?: string | Date | null;
    email_verification_sent_at?: string | Date | null;
    password_reset_token_hash?: string | null;
    password_reset_expires_at?: string | Date | null;
    pending_email?: string | null;
    email_change_token_hash?: string | null;
    email_change_expires_at?: string | Date | null;
    refresh_token?: string | null;
    [key: string]: unknown;
};

export type CustomerProfileRow = UserRow & {
    order_count?: number;
    total_spent?: number;
    wishlist_count?: number;
};

export type CustomerRecentOrderRow = {
    id: number;
    total_price: number;
    discount: number;
    status?: number;
    date_added?: string;
    [key: string]: unknown;
};
