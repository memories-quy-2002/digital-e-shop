import { beforeEach, describe, expect, it, vi } from "vitest";
import http from "../../lib/http";
import { cancelCustomerOrder, previewGuestCart } from "./api";

vi.mock("../../lib/http", () => ({
    default: {
        post: vi.fn(),
    },
}));

describe("orders API", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(http.post).mockResolvedValue({ data: { order: { id: 42, status: 2 } } } as never);
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
});
