export type ProductAlertType = "price_drop" | "back_in_stock";

export interface ProductSnapshot {
    productId: number;
    price: number;
    salePrice: number | null;
    stock: number;
}

export interface ProductAlertTransition {
    type: ProductAlertType;
    productId: number;
    previousPrice: number;
    currentPrice: number;
    previousStock: number;
    currentStock: number;
}

export interface ProductAlertPreference {
    productId: number;
    priceDropEnabled: boolean;
    backInStockEnabled: boolean;
}
