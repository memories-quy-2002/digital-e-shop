export type ReviewRow = {
    id?: number;
    product_id?: number;
    user_id?: string;
    rating?: number;
    comment?: string;
    verified_purchase?: number | boolean;
    [key: string]: unknown;
};

export type RatingSummaryRow = {
    total?: number;
    average?: number;
    five?: number;
    four?: number;
    three?: number;
    two?: number;
    one?: number;
};
