import { beforeEach, describe, expect, it, vi } from "vitest";
import http from "../../lib/http";
import {
    applyCustomerDiscount,
    cancelCustomerOrder,
    clearGuestCartServer,
    createGuestPayOSCheckoutSession,
    createGuestPurchase,
    createPayOSCheckoutSession,
    fetchGuestCart,
    fetchGuestOrderByPayOSOrderCode,
    getPaymentAttempt,
    getGuestPaymentAttempt,
    reconcilePaymentAttempt,
    cancelPaymentAttempt,
    reconcileGuestPaymentAttempt,
    cancelGuestPaymentAttempt,
    fetchCustomerCart,
    lookupGuestOrder,
    previewGuestCart,
    removeCustomerCartItem,
    syncGuestCart,
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
        await removeCustomerCartItem("user-1", 7);
        await expect(validateCustomerCart("user-1")).resolves.toEqual({ valid: false, cartItems: [], issues: [] });
        vi.mocked(http.post).mockResolvedValueOnce({ data: { newPrice: 100 } } as never);
        await expect(applyCustomerDiscount("SAVE10", 100)).resolves.toEqual({ newPrice: 100 });

        expect(http.get).toHaveBeenNthCalledWith(1, "/api/cart/user-1");
        expect(http.put).toHaveBeenCalledWith("/api/cart/", { uid: "user-1", cartItemId: 7, quantity: 3 });
        expect(http.delete).toHaveBeenCalledWith("/api/cart/", { data: { uid: "user-1", cartItemId: 7 } });
        expect(http.get).toHaveBeenNthCalledWith(2, "/api/cart/user-1/validation");
        expect(http.post).toHaveBeenLastCalledWith("/api/orders/discount", { discountCode: "SAVE10", price: 100 });
    });

    it("normalizes finite authenticated quantities and skips non-finite writes", async () => {
        await updateCustomerCartItem("user-1", 7, 3.9);
        await updateCustomerCartItem("user-1", 7, Number.NaN);

        expect(http.put).toHaveBeenCalledTimes(1);
        expect(http.put).toHaveBeenCalledWith("/api/cart/", { uid: "user-1", cartItemId: 7, quantity: 3 });
    });

    it("uses the anonymous cookie-backed guest cart endpoints", async () => {
        vi.mocked(http.get).mockResolvedValueOnce({ data: { items: [{ product_id: 18, quantity: 2 }] } } as never);
        vi.mocked(http.post)
            .mockResolvedValueOnce({ data: { items: [{ productId: 18, quantity: 3 }] } } as never)
            .mockResolvedValueOnce({ data: {} } as never);

        await expect(fetchGuestCart()).resolves.toEqual([{ productId: 18, quantity: 2 }]);
        await expect(syncGuestCart([{ productId: 18, quantity: 3 }])).resolves.toEqual([{ productId: 18, quantity: 3 }]);
        await clearGuestCartServer(true);

        expect(http.post).toHaveBeenNthCalledWith(1, "/api/cart/guest/sync", { items: [{ productId: 18, quantity: 3 }] });
        expect(http.post).toHaveBeenNthCalledWith(2, "/api/cart/guest/clear", { converted: true });
    });

    it("sends guest purchase data without client prices or totals", async () => {
        const deliveryAddress = { recipientName: "Guest Buyer", recipientPhone: "0901234567", addressLine: "1 Main Street", city: "HCMC", latitude: 10.78, longitude: 106.7, country: "VN" as const };
        vi.mocked(http.post).mockResolvedValueOnce({
            data: {
                orderId: 42,
                order: { id: 42, date_added: "2026-09-08T10:00:00.000Z", total_price: 180, discount: 20 },
                guestOrderToken: "raw-token",
                paymentMethod: "cash",
            },
        } as never);

        await expect(createGuestPurchase({
            cart: [{ productId: 10, quantity: 2 }],
            contact: { email: "guest@example.com", name: "Guest Buyer" },
            shipping: { address: "1 Main Street", city: "HCMC", country: "VN" },
            shippingQuoteId: "quote-1",
            deliveryAddress,
            discountCode: "SAVE20",
            paymentMethod: "cash",
            locale: "vi",
        })).resolves.toMatchObject({ orderId: 42, guestOrderToken: "raw-token" });

        expect(http.post).toHaveBeenCalledWith("/api/orders/guest/purchase", {
            cart: [{ productId: 10, quantity: 2 }],
            contact: { email: "guest@example.com", name: "Guest Buyer" },
            shipping: { address: "1 Main Street", city: "HCMC", country: "VN" },
            shippingQuoteId: "quote-1",
            deliveryAddress,
            discountCode: "SAVE20",
            paymentMethod: "cash",
            locale: "vi",
        });
    });

    it("keeps PayOS checkout and guest lookup contracts token-protected", async () => {
        const deliveryAddress = { recipientName: "Guest Buyer", recipientPhone: "0901234567", addressLine: "1 Main Street", city: "HCMC", latitude: 10.78, longitude: 106.7, country: "VN" as const };
        vi.mocked(http.post).mockResolvedValue({
            data: { url: "https://checkout.test/payos", guestOrderToken: "payos-token", orderCode: 123456, currency: "VND" },
        } as never);

        await expect(createGuestPayOSCheckoutSession({
            cart: [{ productId: 10, quantity: 1 }],
            contact: { email: "guest@example.com", name: "Guest Buyer" },
            shipping: { address: "1 Main Street", city: "HCMC", country: "VN" },
            paymentMethod: "payos",
            shippingQuoteId: "quote-1",
            deliveryAddress,
            locale: "en",
        }, "123e4567-e89b-42d3-a456-426614174001")).resolves.toMatchObject({ url: "https://checkout.test/payos", guestOrderToken: "payos-token" });
        await createPayOSCheckoutSession("user-1", {
            cart: [{
                cartItemId: 7,
                productId: 10,
                productName: "Widget",
                category: "Components",
                brand: "Digital-E",
                price: 100,
                sale_price: 80,
                main_image: "widget.jpg",
                quantity: 1,
                stock: 5,
            }],
            totalPrice: 80,
            discount: 0,
            shippingAddress: JSON.stringify({ address: "1 Main Street", city: "HCMC", country: "VN" }),
            shippingQuoteId: "quote-1",
            deliveryAddress,
            locale: "en",
        }, "123e4567-e89b-42d3-a456-426614174001");
        await lookupGuestOrder(42, "lookup-token");
        await fetchGuestOrderByPayOSOrderCode(123456, "payos-token");

        expect(http.post).toHaveBeenNthCalledWith(1, "/api/orders/guest/payos-checkout-session", {
            cart: [{ productId: 10, quantity: 1 }],
            contact: { email: "guest@example.com", name: "Guest Buyer" },
            shipping: { address: "1 Main Street", city: "HCMC", country: "VN" },
            paymentMethod: "payos",
            shippingQuoteId: "quote-1",
            deliveryAddress,
            locale: "en",
        }, { headers: { "Idempotency-Key": "123e4567-e89b-42d3-a456-426614174001" } });
        expect(http.post).toHaveBeenNthCalledWith(2, "/api/orders/payos-checkout-session/user-1", expect.objectContaining({
            totalPrice: 80,
            discount: 0,
            shippingAddress: JSON.stringify({ address: "1 Main Street", city: "HCMC", country: "VN" }),
            shippingQuoteId: "quote-1",
            deliveryAddress,
            locale: "en",
        }), { headers: { "Idempotency-Key": "123e4567-e89b-42d3-a456-426614174001" } });
        expect(http.post).toHaveBeenNthCalledWith(3, "/api/orders/guest/lookup", {
            orderId: 42,
            guestOrderToken: "lookup-token",
        });
        expect(http.post).toHaveBeenNthCalledWith(4, "/api/orders/guest/by-payos-order-code", {
            orderCode: 123456,
            guestOrderToken: "payos-token",
        });
    });

    it("uses owner-scoped status and CSRF-protected action routes", async () => {
        const attemptId = "123e4567-e89b-42d3-a456-426614174000";
        const status = { attemptId, paymentState: "PENDING" };
        vi.mocked(http.get).mockResolvedValueOnce({ data: { paymentAttempt: status } } as never);
        vi.mocked(http.post)
            .mockResolvedValueOnce({ data: { paymentAttempt: status } } as never)
            .mockResolvedValue({ data: { accepted: true } } as never);

        await expect(getPaymentAttempt(attemptId)).resolves.toEqual(status);
        await expect(getGuestPaymentAttempt(attemptId)).resolves.toEqual(status);
        await reconcilePaymentAttempt(attemptId);
        await cancelPaymentAttempt(attemptId);
        await reconcileGuestPaymentAttempt(attemptId);
        await cancelGuestPaymentAttempt(attemptId);

        expect(http.get).toHaveBeenCalledWith(`/api/orders/payment-attempts/${attemptId}`);
        expect(http.post).toHaveBeenNthCalledWith(1, `/api/orders/guest/payment-attempts/${attemptId}/status`, {});
        expect(http.post).toHaveBeenNthCalledWith(2, `/api/orders/payment-attempts/${attemptId}/reconcile`, {});
        expect(http.post).toHaveBeenNthCalledWith(3, `/api/orders/payment-attempts/${attemptId}/cancel`, {});
        expect(http.post).toHaveBeenNthCalledWith(4, `/api/orders/guest/payment-attempts/${attemptId}/reconcile`, {});
        expect(http.post).toHaveBeenNthCalledWith(5, `/api/orders/guest/payment-attempts/${attemptId}/cancel`, {});
    });

    it("rejects malformed payment attempt identifiers before requesting", async () => {
        await expect(getPaymentAttempt("../orders/1")).rejects.toThrow("Invalid payment attempt ID");
        expect(http.get).not.toHaveBeenCalled();
    });
});
