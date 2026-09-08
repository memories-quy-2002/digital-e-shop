import { beforeEach, describe, expect, it, vi } from "vitest";
import http from "../../lib/http";
import {
    applyCustomerDiscount,
    cancelCustomerOrder,
    fetchCustomerCart,
    previewGuestCart,
    removeCustomerCartItem,
    updateCustomerCartItem,
    validateCustomerCart,
} from "./api";

vi.mock("../../lib/http", () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    },
}));

describe("orders API", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(http.post).mockResolvedValue({ data: { order: { id: 42, status: 2 } } } as never);
        vi.mocked(http.get).mockResolvedValue({ data: { cartItems: [] } } as never);
        vi.mocked(http.put).mockResolvedValue({ data: {} } as never);
        vi.mocked(http.delete).mockResolvedValue({ data: {} } as never);
    });

    it("cancels a customer order with an optional reason", async () => {
        await expect(cancelCustomerOrder(42, "Changed my mind")).resolves.toMatchObject({ id: 42, status: 2 });

        expect(http.post).toHaveBeenCalledWith("/api/orders/42/cancel", { reason: "Changed my mind" });
    });

    it("sends an empty payload when no cancellation reason is provided", async () => {
        await cancelCustomerOrder(42);

        expect(http.post).toHaveBeenCalledWith("/api/orders/42/cancel", {});
    });

    it("uses the shared HTTP client for an authoritative guest cart preview", async () => {
        vi.mocked(http.post).mockResolvedValueOnce({
            data: {
                valid: true,
                cartItems: [{
                    product_id: 10,
                    product_name: "Current Widget",
                    category: "Components",
                    brand: "Digital-E",
                    price: 100,
                    sale_price: 80,
                    main_image: "widget.jpg",
                    quantity: 2,
                    stock: 5,
                    available_stock: 5,
                }],
                issues: [],
                merchandiseTotal: 160,
                promotion: {},
                totalPrice: 160,
            },
        } as never);

        await expect(previewGuestCart([{ productId: 10, quantity: 2 }], "SAVE10")).resolves.toMatchObject({
            totalPrice: 160,
            cartItems: [{
                cartItemId: 0,
                productId: 10,
                productName: "Current Widget",
                sale_price: 80,
                quantity: 2,
            }],
        });

        expect(http.post).toHaveBeenCalledWith("/api/cart/guest/preview", {
            items: [{ productId: 10, quantity: 2 }],
            discountCode: "SAVE10",
        });
    });

    it("preserves authenticated cart endpoint contracts and normalization", async () => {
        vi.mocked(http.get).mockResolvedValueOnce({
            data: {
                cartItems: [{ product_id: 10, product_name: "Widget", price: 100, quantity: 2, stock: 5 }],
            },
        } as never);

        await expect(fetchCustomerCart("user-1")).resolves.toMatchObject([{
            cartItemId: 0,
            productId: 10,
            productName: "Widget",
            quantity: 2,
        }]);
        await updateCustomerCartItem("user-1", 7, 3);
        await removeCustomerCartItem(7);
        await expect(validateCustomerCart("user-1")).resolves.toEqual({ valid: false, cartItems: [], issues: [] });
        vi.mocked(http.post).mockResolvedValueOnce({ data: { newPrice: 100 } } as never);
        await expect(applyCustomerDiscount("SAVE10", 100)).resolves.toEqual({ newPrice: 100 });

        expect(http.get).toHaveBeenNthCalledWith(1, "/api/cart/user-1");
        expect(http.put).toHaveBeenCalledWith("/api/cart/", { uid: "user-1", cartItemId: 7, quantity: 3 });
        expect(http.delete).toHaveBeenCalledWith("/api/cart/", { data: { cartItemId: 7 } });
        expect(http.get).toHaveBeenNthCalledWith(2, "/api/cart/user-1/validation");
        expect(http.post).toHaveBeenLastCalledWith("/api/orders/discount", { discountCode: "SAVE10", price: 100 });
    });

    it("normalizes finite authenticated quantities and skips non-finite writes", async () => {
        await updateCustomerCartItem("user-1", 7, 3.9);
        await updateCustomerCartItem("user-1", 7, Number.NaN);

        expect(http.put).toHaveBeenCalledTimes(1);
        expect(http.put).toHaveBeenCalledWith("/api/cart/", { uid: "user-1", cartItemId: 7, quantity: 3 });
    });
});
