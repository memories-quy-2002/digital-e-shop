export type WishlistAlertPreferenceRow = {
    id: number;
    user_id: string;
    product_id: number;
    price_drop_enabled: boolean | number;
    back_in_stock_enabled: boolean | number;
    price_baseline: number | string;
    stock_available: boolean | number;
};

export type ProductAlertChange = {
    productId: number;
    productName: string;
    priceBefore: number;
    salePriceBefore: number | string | null;
    stockBefore: number;
    priceAfter: number;
    salePriceAfter: number | string | null;
    stockAfter: number;
};

export type WishlistAlertNotificationMetadata = {
    productId: number;
    productName: string;
    previousPrice?: number;
    currentPrice: number;
    stock?: number;
};

export type WishlistAlertPreferenceUpdate = {
    priceDropEnabled: boolean;
    backInStockEnabled: boolean;
};

export type WishlistAlertPreferenceState = {
    priceBaseline: number;
    stockAvailable: boolean;
};
