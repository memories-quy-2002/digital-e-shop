import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CheckoutSuccessPage from "./CheckoutSuccessPage";

const mocks = vi.hoisted(() => ({
    auth: { userData: null as { username?: string; email?: string } | null, loading: false },
    clearCart: vi.fn(),
    fetchCart: vi.fn(),
    fetchGuestOrderByPayOSOrderCode: vi.fn(),
    lookupGuestOrder: vi.fn(),
    httpGet: vi.fn(),
    guestAttempt: vi.fn(),
    customerAttempt: vi.fn(),
    guestReconcile: vi.fn(),
    customerReconcile: vi.fn(),
    guestCancel: vi.fn(),
    customerCancel: vi.fn(),
    fetchCustomerCart: vi.fn(),
    updateCustomerCartItem: vi.fn(),
    removeCustomerCartItem: vi.fn(),
    syncGuestCart: vi.fn(),
}));

vi.mock("../../../context/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("../../../context/CartContext", () => ({ useCart: () => ({ clearCart: mocks.clearCart, fetchCart: mocks.fetchCart }) }));
vi.mock("../api", () => ({
    fetchGuestOrderByPayOSOrderCode: mocks.fetchGuestOrderByPayOSOrderCode,
    lookupGuestOrder: mocks.lookupGuestOrder,
    getGuestPaymentAttempt: mocks.guestAttempt,
    getPaymentAttempt: mocks.customerAttempt,
    reconcileGuestPaymentAttempt: mocks.guestReconcile,
    reconcilePaymentAttempt: mocks.customerReconcile,
    cancelGuestPaymentAttempt: mocks.guestCancel,
    cancelPaymentAttempt: mocks.customerCancel,
    fetchCustomerCart: mocks.fetchCustomerCart,
    updateCustomerCartItem: mocks.updateCustomerCartItem,
    removeCustomerCartItem: mocks.removeCustomerCartItem,
    syncGuestCart: mocks.syncGuestCart,
}));
vi.mock("../../../lib/http", () => ({ default: { get: mocks.httpGet } }));
vi.mock("../../../components/layout/Layout", () => ({
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("react-helmet-async", () => ({ Helmet: () => null }));
const mockTranslate = vi.hoisted(() => (key: string) => key);
vi.mock("../../../hooks/useT", () => ({ useT: () => mockTranslate }));
vi.mock("../../shipping/api", () => ({ fetchCustomerShipment: vi.fn().mockResolvedValue(null), fetchGuestShipment: vi.fn().mockResolvedValue(null) }));

describe("CheckoutSuccessPage guest flow", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sessionStorage.clear();
        localStorage.clear();
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: { writeText: vi.fn().mockResolvedValue(undefined) },
        });
        mocks.auth.userData = null;
        mocks.auth.loading = false;
        mocks.clearCart.mockReset();
        mocks.fetchCart.mockResolvedValue(true);
        mocks.lookupGuestOrder.mockReset();
        mocks.guestAttempt.mockReset();
        mocks.customerAttempt.mockReset();
        mocks.fetchCustomerCart.mockResolvedValue([]);
        mocks.syncGuestCart.mockResolvedValue([]);
    });

    it("ignores stale success cache and shows pending server totals without clearing the cart", async () => {
        const attemptId = "123e4567-e89b-42d3-a456-426614174000";
        sessionStorage.setItem("checkoutSuccess", JSON.stringify({ orderId: "7", totalPrice: 1, itemsCount: 1 }));
        mocks.guestAttempt.mockResolvedValue({
            attemptId,
            providerOrderCode: "123456",
            paymentState: "PENDING",
            orderState: "NOT_CREATED",
            resolutionState: "NONE",
            orderId: null,
            items: [{ productId: 1, name: "Server item", quantity: 2, unitPriceVnd: 50_000 }],
            delivery: null,
            subtotalVnd: 100_000,
            discountVnd: 10_000,
            shippingVnd: 20_000,
            payableVnd: 110_000,
            currency: "VND",
            expiresAt: "2026-10-15T10:00:00.000Z",
            lastCheckedAt: null,
            retryAfterSeconds: 2,
            supportReference: "PAY-12345678",
            resumeUrl: null,
        });

        render(
            <MemoryRouter initialEntries={[`/checkout-success?payment_attempt_id=${attemptId}`]}>
                <CheckoutSuccessPage />
            </MemoryRouter>,
        );

        expect(await screen.findByRole("heading", { name: "attemptPendingTitle" })).toBeInTheDocument();
        expect(screen.getByText(/110\.000/)).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "Order confirmed" })).not.toBeInTheDocument();
        expect(mocks.clearCart).not.toHaveBeenCalled();
        expect(mocks.guestAttempt).toHaveBeenCalledWith(attemptId);
    });

    it("confirms only when the backend reports paid, created, and an order ID", async () => {
        const attemptId = "123e4567-e89b-42d3-a456-426614174000";
        mocks.guestAttempt.mockResolvedValue({
            attemptId,
            providerOrderCode: "123456",
            paymentState: "PAID",
            orderState: "CREATED",
            resolutionState: "NONE",
            orderId: 42,
            items: [],
            delivery: null,
            subtotalVnd: 0,
            discountVnd: 0,
            shippingVnd: 0,
            payableVnd: 0,
            currency: "VND",
            expiresAt: "2026-10-15T10:00:00.000Z",
            lastCheckedAt: null,
            retryAfterSeconds: null,
            supportReference: "PAY-12345678",
            resumeUrl: null,
        });

        render(
            <MemoryRouter initialEntries={[`/checkout-success?payment_attempt_id=${attemptId}`]}>
                <CheckoutSuccessPage />
            </MemoryRouter>,
        );

        expect(await screen.findByRole("heading", { name: "attemptConfirmedTitle" })).toBeInTheDocument();
        expect(screen.getByText("42")).toBeInTheDocument();
    });

    it("keeps the payment state and points to order policy when cancellation returns 409", async () => {
        const attemptId = "123e4567-e89b-42d3-a456-426614174000";
        mocks.guestAttempt.mockResolvedValue({
            attemptId,
            providerOrderCode: "123456",
            paymentState: "PENDING",
            orderState: "NOT_CREATED",
            resolutionState: "NONE",
            orderId: null,
            items: [],
            delivery: null,
            subtotalVnd: 0,
            discountVnd: 0,
            shippingVnd: 0,
            payableVnd: 0,
            currency: "VND",
            expiresAt: "2026-10-15T10:00:00.000Z",
            lastCheckedAt: null,
            retryAfterSeconds: 2,
            supportReference: "PAY-12345678",
            resumeUrl: null,
        });
        mocks.guestCancel.mockRejectedValue({ response: { status: 409 } });

        render(
            <MemoryRouter initialEntries={[`/checkout-success?payment_attempt_id=${attemptId}`]}>
                <CheckoutSuccessPage />
            </MemoryRouter>,
        );

        fireEvent.click(await screen.findByRole("button", { name: "attemptCancel" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("attemptCancelOrderExists");
        expect(screen.getByRole("heading", { name: "attemptPendingTitle" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "attemptOpenOrders" })).toHaveAttribute("href", "/guest-order");
    });

    it("masks the immediate guest order token by default", async () => {
        sessionStorage.setItem("checkoutSuccess", JSON.stringify({
            orderId: "42",
            totalPrice: 160,
            discount: 0,
            subtotal: 160,
            itemsCount: 2,
            placedAt: "2026-09-08T10:00:00.000Z",
            paymentMethod: "cash",
            email: "guest@example.com",
            name: "Guest Buyer",
            guestOrderToken: "guest-token",
        }));

        render(
            <MemoryRouter initialEntries={["/checkout-success"]}>
                <CheckoutSuccessPage />
            </MemoryRouter>,
        );

        expect(await screen.findByDisplayValue("guest-token")).toBeInTheDocument();
        expect(screen.getByLabelText("checkoutSuccess.accessToken")).toHaveAttribute("type", "password");
        expect(screen.getByRole("link", { name: "checkoutSuccess.lookupGuestOrder" })).toHaveAttribute("href", "/guest-order");
        expect(screen.queryByText(/Order updates will be sent/)).not.toBeInTheDocument();
        await waitFor(() => expect(mocks.fetchCart).toHaveBeenCalled());
        expect(mocks.clearCart).toHaveBeenCalled();
    });

    it("reveals and copies the guest access token only after explicit actions", async () => {
        sessionStorage.setItem("checkoutSuccess", JSON.stringify({
            orderId: "42",
            totalPrice: 160,
            discount: 0,
            subtotal: 160,
            itemsCount: 2,
            placedAt: "2026-09-08T10:00:00.000Z",
            paymentMethod: "cash",
            email: "guest@example.com",
            name: "Guest Buyer",
            guestOrderToken: "guest-token",
        }));

        render(
            <MemoryRouter initialEntries={["/checkout-success"]}>
                <CheckoutSuccessPage />
            </MemoryRouter>,
        );

        const tokenInput = await screen.findByLabelText("checkoutSuccess.accessToken");
        expect(tokenInput).toHaveAttribute("type", "password");

        fireEvent.click(screen.getByRole("button", { name: "checkoutSuccess.revealToken" }));
        expect(tokenInput).toHaveAttribute("type", "text");
        fireEvent.click(screen.getByRole("button", { name: "checkoutSuccess.hideToken" }));
        expect(tokenInput).toHaveAttribute("type", "password");

        fireEvent.click(screen.getByRole("button", { name: "checkoutSuccess.copyAccessToken" }));
        await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("guest-token"));
    });

    it("shows the payable total after subtracting the stored discount", async () => {
        sessionStorage.setItem("checkoutSuccess", JSON.stringify({
            orderId: "42",
            totalPrice: 200,
            discount: 20,
            subtotal: 160,
            shippingFee: 40,
            itemsCount: 2,
            paymentMethod: "cash",
        }));

        render(
            <MemoryRouter initialEntries={["/checkout-success"]}>
                <CheckoutSuccessPage />
            </MemoryRouter>,
        );

        const dueCard = await screen.findByText("checkoutSuccess.amountDue");
        expect(dueCard.closest("article")).toHaveTextContent(/180/);
        expect(screen.getByRole("region", { name: "checkoutSuccess.orderSummary" })).toBeInTheDocument();
    });

    it("hydrates guest contact and shipping details after a success-page refresh", async () => {
        sessionStorage.setItem("checkoutSuccess", JSON.stringify({
            orderId: "42",
            totalPrice: 160,
            discount: 0,
            subtotal: 160,
            itemsCount: 2,
            placedAt: "2026-09-08T10:00:00.000Z",
            paymentMethod: "cash",
            guestOrderToken: "guest-token",
        }));
        mocks.lookupGuestOrder.mockResolvedValue({
            id: 42,
            date_added: "2026-09-08T10:00:00.000Z",
            guest_email: "guest@example.com",
            guest_name: "Guest Buyer",
            guest_phone: "0901234567",
            status: 1,
            total_price: 160,
            discount: 0,
            shipping_address: JSON.stringify({ address: "1 Main Street", city: "HCMC", country: "VN" }),
            payment_method: "cash",
            items: [{ productId: 10, productName: "Widget", quantity: 2, totalPrice: 160 }],
        });

        render(
            <MemoryRouter initialEntries={["/checkout-success"]}>
                <CheckoutSuccessPage />
            </MemoryRouter>,
        );

        await waitFor(() => expect(mocks.lookupGuestOrder).toHaveBeenCalledWith(42, "guest-token"));
        expect(await screen.findByText("Guest Buyer")).toBeInTheDocument();
        expect(screen.getByText("1 Main Street")).toBeInTheDocument();
        expect(screen.getByText("guest@example.com")).toBeInTheDocument();
        expect(screen.getByText("******4567")).toBeInTheDocument();
    });

    it("does not treat an order-code query as payment evidence", async () => {
        sessionStorage.setItem("checkoutPending", JSON.stringify({
            totalPrice: 160,
            discount: 0,
            subtotal: 160,
            itemsCount: 2,
            paymentMethod: "payos",
            guestOrderToken: "payos-token",
        }));
        render(
            <MemoryRouter initialEntries={["/checkout-success?payment_provider=payos&payos_order_code=123456"]}>
                <CheckoutSuccessPage />
            </MemoryRouter>,
        );

        expect(screen.getByRole("heading", { name: "attemptUnknownTitle" })).toBeInTheDocument();
        expect(screen.getByText("attemptMissingReferenceBody")).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "Order confirmed" })).not.toBeInTheDocument();
        expect(mocks.fetchGuestOrderByPayOSOrderCode).not.toHaveBeenCalled();
        expect(mocks.clearCart).not.toHaveBeenCalled();
    });

    it("does not reuse a cached PayOS attempt on an unrelated COD success route", async () => {
        const attemptId = "123e4567-e89b-42d3-a456-426614174000";
        sessionStorage.setItem("checkoutPending", JSON.stringify({
            version: 2,
            idempotencyKey: "123e4567-e89b-42d3-a456-426614174001",
            requestFingerprint: "old-payos-checkout",
            attemptId,
            cartSnapshot: [{ productId: 10, quantity: 1 }],
        }));
        sessionStorage.setItem("checkoutSuccess", JSON.stringify({
            orderId: "44",
            totalPrice: 160,
            discount: 0,
            subtotal: 160,
            itemsCount: 2,
            placedAt: "2026-09-09T10:00:00.000Z",
            paymentMethod: "cash",
        }));

        render(
            <MemoryRouter initialEntries={["/checkout-success"]}>
                <CheckoutSuccessPage />
            </MemoryRouter>,
        );

        expect(await screen.findByText("44")).toBeInTheDocument();
        expect(mocks.guestAttempt).not.toHaveBeenCalled();
        expect(mocks.customerAttempt).not.toHaveBeenCalled();
        await waitFor(() => expect(mocks.clearCart).toHaveBeenCalled());
    });

    it("refreshes an authenticated cart after an order is confirmed", async () => {
        mocks.auth.userData = { username: "Demo User", email: "demo@example.com" };
        sessionStorage.setItem("checkoutSuccess", JSON.stringify({
            orderId: "44",
            totalPrice: 160,
            discount: 0,
            subtotal: 160,
            itemsCount: 2,
            placedAt: "2026-09-09T10:00:00.000Z",
            paymentMethod: "cash",
        }));

        render(
            <MemoryRouter initialEntries={["/checkout-success"]}>
                <CheckoutSuccessPage />
            </MemoryRouter>,
        );

        await waitFor(() => expect(mocks.fetchCart).toHaveBeenCalled());
        expect(mocks.clearCart).toHaveBeenCalled();
    });
});
