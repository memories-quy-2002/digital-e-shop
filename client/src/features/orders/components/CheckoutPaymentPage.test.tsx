import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CheckoutPaymentPage from "./CheckoutPaymentPage";

const mocks = vi.hoisted(() => ({
    auth: { userData: null as { id: string } | null, loading: false },
    toast: { addToast: vi.fn() },
    guestPurchase: vi.fn(),
    guestSession: vi.fn(),
}));

vi.mock("../../../context/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("../../../context/ToastContext", () => ({ useToast: () => mocks.toast }));
vi.mock("../api", () => ({
    createGuestPurchase: mocks.guestPurchase,
    createGuestCheckoutSession: mocks.guestSession,
}));
vi.mock("../../../lib/http", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("../../users/api", () => ({ fetchCustomerAddresses: vi.fn() }));
vi.mock("react-helmet", () => ({ Helmet: () => null }));

const cart = [{
    cartItemId: 0,
    productId: 10,
    productName: "Widget",
    category: "Components",
    brand: "Digital-E",
    price: 100,
    sale_price: 80,
    main_image: "widget.jpg",
    quantity: 2,
    stock: 5,
    available_stock: 5,
}];

const renderCheckout = () => render(
    <MemoryRouter>
        <CheckoutPaymentPage
            setIsPayment={vi.fn()}
            cart={cart}
            totalPrice={160}
            discount={0}
            discountCode={null}
            subtotal={160}
            validationIssues={[]}
            onValidationRefresh={vi.fn()}
        />
    </MemoryRouter>,
);

const fillRequiredFields = () => {
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "guest@example.com" } });
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Guest" } });
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Buyer" } });
    fireEvent.change(screen.getByLabelText("Shipping address"), { target: { value: "1 Main Street" } });
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "HCMC" } });
    fireEvent.change(screen.getByLabelText("Country"), { target: { value: "VN" } });
};

describe("CheckoutPaymentPage guest checkout", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sessionStorage.clear();
        mocks.auth.userData = null;
        mocks.auth.loading = false;
        mocks.guestPurchase.mockResolvedValue({
            orderId: 42,
            order: { id: 42, date_added: "2026-09-08T10:00:00.000Z", total_price: 160, discount: 0 },
            guestOrderToken: "guest-token",
            paymentMethod: "cash",
        });
    });

    it.each([
        "cash",
        "bank_transfer",
        "payos",
    ] as const)("submits the guest %s purchase contract", async (paymentMethod) => {
        renderCheckout();
        fillRequiredFields();
        fireEvent.click(screen.getByDisplayValue(paymentMethod));
        fireEvent.click(screen.getByRole("button", { name: "Place order" }));

        await waitFor(() => expect(mocks.guestPurchase).toHaveBeenCalledWith({
            cart: [{ productId: 10, quantity: 2 }],
            contact: { email: "guest@example.com", name: "Guest Buyer" },
            shipping: { address: "1 Main Street", city: "HCMC", country: "VN" },
            paymentMethod,
        }));
        expect(mocks.guestPurchase.mock.calls[0][0]).not.toHaveProperty("totalPrice");
        expect(mocks.guestPurchase.mock.calls[0][0]).not.toHaveProperty("cart[0].price");
    });

    it("creates a guest card session with the raw access token kept in pending session storage", async () => {
        mocks.guestSession.mockResolvedValue({ url: "", guestOrderToken: "stripe-token" });
        renderCheckout();
        fillRequiredFields();
        fireEvent.click(screen.getByDisplayValue("card"));
        fireEvent.click(screen.getByRole("button", { name: "Place order" }));

        await waitFor(() => expect(mocks.guestSession).toHaveBeenCalledWith({
            cart: [{ productId: 10, quantity: 2 }],
            contact: { email: "guest@example.com", name: "Guest Buyer" },
            shipping: { address: "1 Main Street", city: "HCMC", country: "VN" },
            paymentMethod: "card",
        }));
        expect(JSON.parse(sessionStorage.getItem("checkoutPending") || "{}")).toMatchObject({
            guestOrderToken: "stripe-token",
            email: "guest@example.com",
        });
    });
});
