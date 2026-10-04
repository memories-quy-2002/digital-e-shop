import type { CartItemRow } from "../cart/cart.types";
import { attributeMapToSnapshot, type ProductAttribute } from "../products/product-attributes.types";
import type { OrderItemSnapshot } from "./orders.types";

export const parseSpecificationsSnapshot = (value: unknown): Record<string, unknown> => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }

    if (typeof value === "string" && value.trim()) {
        try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                return parsed as Record<string, unknown>;
            }
        } catch {
            return { raw: value };
        }
        return { raw: value };
    }

    return {};
};

export const buildOrderItemSnapshot = (product: CartItemRow, currentAttributes?: ProductAttribute[]): OrderItemSnapshot => {
    const productId = Number(product.product_id || 0);
    const quantity = Number(product.quantity) || 0;
    const unitPrice = product.sale_price !== null && product.sale_price !== undefined
        ? Number(product.sale_price)
        : Number(product.price) || 0;

    const structuredAttributes = attributeMapToSnapshot(currentAttributes);

    return {
        productId,
        sku: String(product.sku || `DIG-${String(productId).padStart(8, "0")}`).trim(),
        productName: String(product.product_name || `Product #${productId}`),
        image: product.main_image ? String(product.main_image) : null,
        unitPrice,
        brand: String(product.brand || ""),
        category: String(product.category || ""),
        warrantyMonths: product.warranty_months === null || product.warranty_months === undefined
            ? null
            : Number(product.warranty_months),
        specifications: Object.keys(structuredAttributes).length > 0
            ? structuredAttributes
            : parseSpecificationsSnapshot(product.specifications),
        quantity,
    };
};
