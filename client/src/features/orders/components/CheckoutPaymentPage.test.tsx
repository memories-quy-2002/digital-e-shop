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
    customerAddresses: vi.fn(),
    customerOrders: vi.fn(),
    httpGet: vi.fn(),
    httpPost: vi.fn(),
}));

vi.mock("../../../context/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("../../../context/ToastContext", () => ({ useToast: () => mocks.toast }));
vi.mock("../api", () => ({
    createGuestPurchase: mocks.guestPurchase,
    createGuestCheckoutSession: mocks.guestSession,
    fetchCustomerOrders: mocks.customerOrders,
}));
vi.mock("../../../lib/http", () => ({ default: { get: mocks.httpGet, post: mocks.httpPost } }));
vi.mock("../../users/api", () => ({ fetchCustomerAddresses: mocks.customerAddresses }));
vi.mock("react-helmet-async", () => ({ Helmet: () => null }));

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
        mocks.customerAddresses.mockResolvedValue([]);
        mocks.customerOrders.mockResolvedValue([]);
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

    it("stores the raw guest access token without persisting guest PII", async () => {
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
        const pendingCheckout = JSON.parse(sessionStorage.getItem("checkoutPending") || "{}");
        expect(pendingCheckout).toMatchObject({ guestOrderToken: "stripe-token" });
        expect(pendingCheckout).not.toHaveProperty("email");
        expect(pendingCheckout).not.toHaveProperty("name");
        expect(pendingCheckout).not.toHaveProperty("address");
        expect(pendingCheckout).not.toHaveProperty("city");
        expect(pendingCheckout).not.toHaveProperty("country");
        expect(pendingCheckout).not.toHaveProperty("phone");
    });

    it("shows a clickable recent order address when no saved address is available", async () => {
        mocks.auth.userData = { id: "user-1" };
        mocks.customerOrders.mockResolvedValue([{
            id: 42,
            date_added: "2026-09-08T10:00:00.000Z",
            status: 1,
            total_price: 160,
            discount: 0,
            shipping_address: JSON.stringify({ address: "42 Nguyen Hue", city: "HCMC", country: "VN" }),
        }]);

        renderCheckout();

        const recommendation = await screen.findByRole("button", { name: /use address from order #42/i });
        fireEvent.click(recommendation);

        expect(screen.getByLabelText("Shipping address")).toHaveValue("42 Nguyen Hue");
        expect(screen.getByLabelText("City")).toHaveValue("HCMC");
        expect(screen.getByLabelText("Country")).toHaveValue("VN");
    });

    it("stores the complete authenticated shipping snapshot and preserves the order flow", async () => {
        mocks.auth.userData = { id: "user-1" };
        mocks.httpGet.mockResolvedValue({
            status: 200,
            data: { valid: true, cartItems: [{
                cart_item_id: 7,
                product_id: 10,
                product_name: "Widget",
                category: "Components",
                brand: "Digital-E",
                price: 100,
                sale_price: 80,
                main_image: "widget.jpg",
                quantity: 2,
                stock: 5,
                available_stock: 5,
            }] },
        });
        mocks.httpPost.mockResolvedValue({
            status: 201,
            data: { order: { id: 44, date_added: "2026-09-09T10:00:00.000Z" } },
        });

        renderCheckout();
        fillRequiredFields();
        fireEvent.click(screen.getByDisplayValue("cash"));
        await waitFor(() => expect(screen.getByRole("button", { name: "Place order" })).toBeEnabled());
        fireEvent.click(screen.getByRole("button", { name: "Place order" }));

        await waitFor(() => expect(mocks.httpPost).toHaveBeenCalledWith("/api/orders/purchase/user-1", expect.objectContaining({
            shippingAddress: JSON.stringify({ address: "1 Main Street", city: "HCMC", country: "VN" }),
        })));
    });
});
