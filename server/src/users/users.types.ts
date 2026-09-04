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
