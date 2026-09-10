import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CheckoutSuccessPage from "./CheckoutSuccessPage";

const mocks = vi.hoisted(() => ({
    auth: { userData: null as { username?: string; email?: string } | null, loading: false },
    clearCart: vi.fn(),
    fetchCart: vi.fn(),
    fetchGuestOrderBySession: vi.fn(),
    fetchGuestOrderByPayOSOrderCode: vi.fn(),
    lookupGuestOrder: vi.fn(),
    httpGet: vi.fn(),
}));

vi.mock("../../../context/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("../../../context/CartContext", () => ({ useCart: () => ({ clearCart: mocks.clearCart, fetchCart: mocks.fetchCart }) }));
vi.mock("../api", () => ({
    fetchGuestOrderBySession: mocks.fetchGuestOrderBySession,
    fetchGuestOrderByPayOSOrderCode: mocks.fetchGuestOrderByPayOSOrderCode,
    lookupGuestOrder: mocks.lookupGuestOrder,
}));
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
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: { writeText: vi.fn().mockResolvedValue(undefined) },
        });
        mocks.auth.userData = null;
        mocks.auth.loading = false;
        mocks.clearCart.mockReset();
        mocks.fetchCart.mockResolvedValue(true);
        mocks.lookupGuestOrder.mockReset();
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
        expect(screen.getByLabelText("Guest order access token")).toHaveAttribute("type", "password");
        expect(screen.getByRole("link", { name: /look up guest order/i })).toHaveAttribute("href", "/guest-order");
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

        const tokenInput = await screen.findByLabelText("Guest order access token");
        expect(tokenInput).toHaveAttribute("type", "password");

        fireEvent.click(screen.getByRole("button", { name: "Reveal token" }));
        expect(tokenInput).toHaveAttribute("type", "text");
        fireEvent.click(screen.getByRole("button", { name: "Hide token" }));
        expect(tokenInput).toHaveAttribute("type", "password");

        fireEvent.click(screen.getByRole("button", { name: "Copy access token" }));
        await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("guest-token"));
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

    it("finalizes a guest PayOS payment through the token-protected order-code endpoint", async () => {
        sessionStorage.setItem("checkoutPending", JSON.stringify({
            totalPrice: 160,
            discount: 0,
            subtotal: 160,
            itemsCount: 2,
            paymentMethod: "payos",
            guestOrderToken: "payos-token",
        }));
        mocks.fetchGuestOrderByPayOSOrderCode.mockResolvedValue({
            id: 44,
            date_added: "2026-09-10T10:00:00.000Z",
            guest_email: "guest@example.com",
            guest_name: "Guest Buyer",
            guest_phone: null,
            status: 0,
            total_price: 160,
            discount: 0,
            shipping_address: JSON.stringify({ address: "1 Main Street", city: "HCMC", country: "VN" }),
            payment_method: "payos",
            items: [{ productId: 10, productName: "Widget", quantity: 2, totalPrice: 160 }],
        });

        render(
            <MemoryRouter initialEntries={["/checkout-success?payment_provider=payos&payos_order_code=123456"]}>
                <CheckoutSuccessPage />
            </MemoryRouter>,
        );

        await waitFor(() => expect(mocks.fetchGuestOrderByPayOSOrderCode).toHaveBeenCalledWith(123456, "payos-token"));
        expect(await screen.findByDisplayValue("payos-token")).toBeInTheDocument();
        expect(mocks.fetchGuestOrderBySession).not.toHaveBeenCalled();
        expect(mocks.fetchCart).toHaveBeenCalled();
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
