export type ProductAlertKey = "priceDropEnabled" | "backInStockEnabled";

export type ProductAlertPreference = {
    productId: number;
    priceDropEnabled: boolean;
    backInStockEnabled: boolean;
};

export type ProductAlertUpdateInput = Pick<ProductAlertPreference, "priceDropEnabled" | "backInStockEnabled">;
