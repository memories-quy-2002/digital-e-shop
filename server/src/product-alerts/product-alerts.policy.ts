import type {
    ProductAlertTransition,
    ProductSnapshot,
} from "./product-alerts.types";

function normalizeFiniteNumber(value: unknown): number | null {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }

    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}

export function effectiveProductPrice(
    price: unknown,
    salePrice: unknown,
): number {
    const normalizedPrice = normalizeFiniteNumber(price);
    if (normalizedPrice === null || normalizedPrice <= 0) {
        return 0;
    }

    const normalizedSalePrice = normalizeFiniteNumber(salePrice);
    if (
        normalizedSalePrice !== null
        && normalizedSalePrice > 0
        && normalizedSalePrice < normalizedPrice
    ) {
        return normalizedSalePrice;
    }

    return normalizedPrice;
}

export function getProductAlertTransitions(
    before: ProductSnapshot,
    after: ProductSnapshot,
): ProductAlertTransition[] {
    const previousPrice = effectiveProductPrice(before.price, before.salePrice);
    const currentPrice = effectiveProductPrice(after.price, after.salePrice);
    const previousStock = normalizeFiniteNumber(before.stock);
    const currentStock = normalizeFiniteNumber(after.stock);

    const transitions: ProductAlertTransition[] = [];
    if (
        previousPrice > 0
        && currentPrice > 0
        && currentPrice < previousPrice
    ) {
        transitions.push({
            type: "price_drop",
            productId: after.productId,
            previousPrice,
            currentPrice,
            previousStock: previousStock ?? 0,
            currentStock: currentStock ?? 0,
        });
    }

    if (
        previousStock !== null
        && currentStock !== null
        && previousStock <= 0
        && currentStock > 0
    ) {
        transitions.push({
            type: "back_in_stock",
            productId: after.productId,
            previousPrice,
            currentPrice,
            previousStock,
            currentStock,
        });
    }

    return transitions;
}
