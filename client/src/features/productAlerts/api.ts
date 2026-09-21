import http from "../../lib/http";
import type { ProductAlertPreference, ProductAlertUpdateInput } from "./types";

const preferenceFallback = (productId: number): ProductAlertPreference => ({
    productId,
    priceDropEnabled: false,
    backInStockEnabled: false,
});

const normalizePreference = (value: unknown, fallbackProductId: number): ProductAlertPreference => {
    const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return {
        productId: Number(source.productId ?? source.product_id ?? fallbackProductId) || fallbackProductId,
        priceDropEnabled: Boolean(source.priceDropEnabled ?? source.price_drop_enabled),
        backInStockEnabled: Boolean(source.backInStockEnabled ?? source.back_in_stock_enabled),
    };
};

export const fetchProductAlerts = async (uid: string): Promise<ProductAlertPreference[]> => {
    const response = await http.get(`/api/users/${encodeURIComponent(uid)}/product-alerts`);
    const alerts = response.data?.alerts;
    return Array.isArray(alerts)
        ? alerts.map((alert: unknown) => normalizePreference(alert, 0))
        : [];
};

export const fetchProductAlert = async (uid: string, productId: number): Promise<ProductAlertPreference> => {
    const response = await http.get(`/api/users/${encodeURIComponent(uid)}/product-alerts/${productId}`);
    return normalizePreference(response.data?.alert, productId);
};

export const updateProductAlert = async (
    uid: string,
    productId: number,
    input: ProductAlertUpdateInput,
): Promise<ProductAlertPreference> => {
    const response = await http.put(
        `/api/users/${encodeURIComponent(uid)}/product-alerts/${productId}`,
        input,
    );
    return normalizePreference(response.data?.alert, productId);
};
