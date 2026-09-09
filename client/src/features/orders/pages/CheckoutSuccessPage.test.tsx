import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CheckoutSuccessPage from "./CheckoutSuccessPage";

const mocks = vi.hoisted(() => ({
    auth: { userData: null as { username?: string; email?: string } | null, loading: false },
    clearCart: vi.fn(),
    fetchCart: vi.fn(),
    fetchGuestOrderBySession: vi.fn(),
    httpGet: vi.fn(),
}));

vi.mock("../../../context/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("../../../context/CartContext", () => ({ useCart: () => ({ clearCart: mocks.clearCart, fetchCart: mocks.fetchCart }) }));
vi.mock("../api", () => ({ fetchGuestOrderBySession: mocks.fetchGuestOrderBySession }));
vi.mock("../../../lib/http", () => ({ default: { get: mocks.httpGet } }));
vi.mock("../../../components/layout/Layout", () => ({
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("react-helmet-async", () => ({ Helmet: () => null }));

describe("CheckoutSuccessPage guest flow", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sessionStorage.clear();
        localStorage.clear();
        mocks.auth.userData = null;
        mocks.auth.loading = false;
        mocks.clearCart.mockReset();
        mocks.fetchCart.mockResolvedValue(true);
    });

    it("shows the immediate guest order token without claiming email delivery", async () => {
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
        expect(screen.getByRole("link", { name: /look up guest order/i })).toHaveAttribute("href", "/guest-order");
        expect(screen.queryByText(/Order updates will be sent/)).not.toBeInTheDocument();
        await waitFor(() => expect(mocks.fetchCart).toHaveBeenCalled());
        expect(mocks.clearCart).toHaveBeenCalled();
    });

    it("finalizes a guest Stripe session through the token-protected endpoint", async () => {
        sessionStorage.setItem("checkoutPending", JSON.stringify({
            totalPrice: 160,
            discount: 0,
            subtotal: 160,
            itemsCount: 2,
            email: "guest@example.com",
            guestOrderToken: "stripe-token",
        }));
        mocks.fetchGuestOrderBySession.mockResolvedValue({
            id: 43,
            date_added: "2026-09-08T10:00:00.000Z",
            guest_email: "guest@example.com",
            guest_name: "Guest Buyer",
            guest_phone: null,
            status: 1,
            total_price: 160,
            discount: 0,
            shipping_address: JSON.stringify({ address: "1 Main Street", city: "HCMC", country: "VN" }),
            payment_method: "card",
            items: [{ productId: 10, productName: "Widget", quantity: 2, totalPrice: 160 }],
        });

        render(
            <MemoryRouter initialEntries={["/checkout-success?session_id=cs_test"]}>
                <CheckoutSuccessPage />
            </MemoryRouter>,
        );

        await waitFor(() => expect(mocks.fetchGuestOrderBySession).toHaveBeenCalledWith("cs_test", "stripe-token"));
        expect(await screen.findByDisplayValue("stripe-token")).toBeInTheDocument();
        expect(mocks.httpGet).not.toHaveBeenCalled();
        expect(mocks.fetchCart).toHaveBeenCalled();
        expect(mocks.clearCart).toHaveBeenCalled();
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
