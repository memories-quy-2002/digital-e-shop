import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CheckoutPaymentPage from "./CheckoutPaymentPage";
import { LocaleProvider } from "../../../context/LocaleContext";

const mocks = vi.hoisted(() => ({
    auth: { userData: null as { id: string } | null, loading: false },
    toast: { addToast: vi.fn() },
    guestPurchase: vi.fn(),
    clearGuestCartServer: vi.fn(),
    guestPayOSSession: vi.fn(),
    payosAuthSession: vi.fn(),
    httpGet: vi.fn(),
    httpPost: vi.fn(),
    navigate: vi.fn(),
    fetchCustomerAddresses: vi.fn(),
    fetchCustomerOrders: vi.fn(),
    onValidationRefresh: vi.fn(),
}));

vi.mock("../../../context/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("../../../context/ToastContext", () => ({ useToast: () => mocks.toast }));
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
    return { ...actual, useNavigate: () => mocks.navigate };
});
vi.mock("../api", () => ({
    createGuestPurchase: mocks.guestPurchase,
    clearGuestCartServer: mocks.clearGuestCartServer,
    createGuestPayOSCheckoutSession: mocks.guestPayOSSession,
    createPayOSCheckoutSession: mocks.payosAuthSession,
    fetchCustomerOrders: mocks.fetchCustomerOrders,
}));
vi.mock("../../users/api", () => ({ fetchCustomerAddresses: mocks.fetchCustomerAddresses }));
vi.mock("../../../lib/http", () => ({ default: { get: mocks.httpGet, post: mocks.httpPost } }));
vi.mock("../../shipping/components/DeliveryQuoteForm", () => ({ default: ({ onQuoteChange, addressPrefill }: { onQuoteChange: (address: unknown, quote: unknown) => void; addressPrefill?: unknown }) => <><button type="button" onClick={() => onQuoteChange({ recipientName: "Guest Buyer", recipientPhone: "0901234567", addressLine: "1 Main Street", provinceCode: "1", provinceName: "HCMC", wardCode: "2", wardName: "HCMC", districtCode: "3", country: "VN" }, { id: "quote-1", expiresAt: new Date(Date.now() + 60000).toISOString(), pricing: { itemsSubtotal: 160, merchandiseDiscount: 0, shippingFee: 20000, payableTotal: 20160, currency: "VND" }, parcel: { grams: 500, lengthCm: 10, widthCm: 10, heightCm: 10 }, serviceTypeId: 2, address: {}, expectedDeliveryAt: null, sandbox: true, parcelEstimated: true })}>Request test quote</button><output data-testid="address-prefill">{addressPrefill ? JSON.stringify(addressPrefill) : ""}</output></> }));
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
        <LocaleProvider>
            <CheckoutPaymentPage
                setIsPayment={vi.fn()}
                cart={cart}
                totalPrice={160}
                discount={0}
                discountCode={null}
                subtotal={160}
                validationIssues={[]}
                onValidationRefresh={mocks.onValidationRefresh}
            />
        </LocaleProvider>
    </MemoryRouter>,
);

const fillRequiredFields = () => {
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "guest@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Request test quote" }));
};

describe("CheckoutPaymentPage guest checkout", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sessionStorage.clear();
        mocks.auth.userData = null;
        mocks.auth.loading = false;
        mocks.fetchCustomerAddresses.mockResolvedValue([]);
        mocks.fetchCustomerOrders.mockResolvedValue([]);
        mocks.guestPurchase.mockResolvedValue({
            orderId: 42,
            order: { id: 42, date_added: "2026-09-08T10:00:00.000Z", total_price: 160, discount: 0 },
            guestOrderToken: "guest-token",
            paymentMethod: "cash",
        });
        mocks.clearGuestCartServer.mockResolvedValue(undefined);
    });

    it("renders only PayOS and cash on delivery", () => {
        renderCheckout();

        expect(screen.getByRole("radio", { name: /PayOS/i })).toBeVisible();
        expect(screen.getByRole("radio", { name: /cash on delivery/i })).toBeVisible();
        expect(screen.queryByRole("radio", { name: /bank transfer/i })).not.toBeInTheDocument();
        expect(screen.queryByRole("radio", { name: /card|stripe/i })).not.toBeInTheDocument();
    });

    it("submits the guest cash purchase contract", async () => {
        const paymentMethod = "cash" as const;
        renderCheckout();
        fillRequiredFields();
        fireEvent.click(screen.getByDisplayValue(paymentMethod));
        fireEvent.click(screen.getByRole("button", { name: "Place order" }));

        await waitFor(() => expect(mocks.guestPurchase).toHaveBeenCalledWith({
            cart: [{ productId: 10, quantity: 2 }],
            contact: { email: "guest@example.com", name: "Guest Buyer", phone: "0901234567" },
            shipping: { address: "1 Main Street", city: "HCMC", country: "VN" },
            discountCode: undefined,
            paymentMethod,
            shippingQuoteId: "quote-1",
            deliveryAddress: { recipientName: "Guest Buyer", recipientPhone: "0901234567", addressLine: "1 Main Street", provinceCode: "1", provinceName: "HCMC", wardCode: "2", wardName: "HCMC", districtCode: "3", country: "VN" },
            locale: "en",
        }));
        expect(mocks.guestPurchase.mock.calls[0][0]).not.toHaveProperty("totalPrice");
        expect(mocks.guestPurchase.mock.calls[0][0]).not.toHaveProperty("cart[0].price");
    });

    it("redirects guest PayOS checkout through a server-created VND payment link", async () => {
        mocks.guestPayOSSession.mockResolvedValue({
            attemptId: "123e4567-e89b-42d3-a456-426614174000",
            sessionState: "CREATING",
            url: null,
            orderCode: 123456,
            amount: 4_000_000,
            currency: "VND",
        });
        renderCheckout();
        fillRequiredFields();
        fireEvent.click(screen.getByDisplayValue("payos"));
        fireEvent.click(screen.getByRole("button", { name: "Continue to PayOS" }));

        await waitFor(() => expect(mocks.guestPayOSSession).toHaveBeenCalledWith({
            cart: [{ productId: 10, quantity: 2 }],
            contact: { email: "guest@example.com", name: "Guest Buyer", phone: "0901234567" },
            shipping: { address: "1 Main Street", city: "HCMC", country: "VN" },
            discountCode: undefined,
            paymentMethod: "payos",
            shippingQuoteId: "quote-1",
            deliveryAddress: { recipientName: "Guest Buyer", recipientPhone: "0901234567", addressLine: "1 Main Street", provinceCode: "1", provinceName: "HCMC", wardCode: "2", wardName: "HCMC", districtCode: "3", country: "VN" },
            locale: "en",
        }, expect.any(String)));
        expect(mocks.guestPurchase).not.toHaveBeenCalled();
        expect(JSON.parse(sessionStorage.getItem("checkoutPending") || "{}")).toMatchObject({
            version: 2,
            attemptId: "123e4567-e89b-42d3-a456-426614174000",
            providerOrderCode: "123456",
            cartSnapshot: [{ productId: 10, quantity: 2 }],
        });
        expect(mocks.navigate).toHaveBeenCalledWith("/checkout-success?payment_attempt_id=123e4567-e89b-42d3-a456-426614174000");
    });

    it("passes guest contact and shipping details through route state without persisting PII", async () => {
        renderCheckout();
        fillRequiredFields();
        fireEvent.click(screen.getByDisplayValue("cash"));
        fireEvent.click(screen.getByRole("button", { name: "Place order" }));

        await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith(
            "/checkout-success",
            expect.objectContaining({
                state: {
                    checkoutSuccess: expect.objectContaining({
                        orderId: "42",
                        email: "guest@example.com",
                        name: "Guest Buyer",
                        address: "1 Main Street",
                        city: "HCMC",
                        country: "VN",
                        guestOrderToken: "guest-token",
                    }),
                },
            }),
        ));

        const storedCheckout = JSON.parse(sessionStorage.getItem("checkoutSuccess") || "{}");
        expect(storedCheckout).not.toHaveProperty("email");
        expect(storedCheckout).not.toHaveProperty("name");
        expect(storedCheckout).not.toHaveProperty("address");
        expect(storedCheckout).not.toHaveProperty("city");
        expect(storedCheckout).not.toHaveProperty("country");
    });

    it("stores the complete authenticated shipping snapshot and preserves the order flow", async () => {
        sessionStorage.setItem("checkoutPending", JSON.stringify({
            version: 2,
            idempotencyKey: "123e4567-e89b-42d3-a456-426614174001",
            requestFingerprint: "old-payos-checkout",
            attemptId: "123e4567-e89b-42d3-a456-426614174000",
            cartSnapshot: [{ productId: 10, quantity: 1 }],
        }));
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
            shippingQuoteId: "quote-1",
            deliveryAddress: expect.objectContaining({ provinceCode: "1", wardCode: "2" }),
            locale: "en",
        })));
        expect(sessionStorage.getItem("checkoutPending")).toBeNull();
    });

    it("prefills saved and recent addresses while requiring explicit province and ward confirmation", async () => {
        mocks.auth.userData = { id: "user-1" };
        mocks.fetchCustomerAddresses.mockResolvedValue([{
            id: 3,
            label: "Home",
            recipient_name: "Saved Buyer",
            phone_number: "0901111222",
            address_line: "9 Saved Road",
            city: "Old City",
            country: "VN",
            is_default: true,
        }]);
        mocks.fetchCustomerOrders.mockResolvedValue([{
            id: 22,
            date_added: "2026-10-12T10:00:00.000Z",
            status: 1,
            total_price: 200,
            discount: 0,
            shipping_address: JSON.stringify({ address: "4 Previous Street", city: "Old District", country: "VN" }),
        }]);
        renderCheckout();

        fireEvent.change(await screen.findByLabelText("Saved address"), { target: { value: "3" } });
        await waitFor(() => expect(screen.getByTestId("address-prefill")).toHaveTextContent('"recipientName":"Saved Buyer"'));
        expect(screen.getByTestId("address-prefill")).toHaveTextContent('"addressLine":"9 Saved Road"');
        expect(screen.getByTestId("address-prefill")).not.toHaveTextContent("provinceCode");

        fireEvent.change(screen.getByLabelText("Recent order address"), { target: { value: "22" } });
        await waitFor(() => expect(screen.getByTestId("address-prefill")).toHaveTextContent('"addressLine":"4 Previous Street"'));
        expect(screen.getByTestId("address-prefill")).not.toHaveTextContent("provinceCode");
    });

    it("rejects checkout when the authoritative cart refresh changes quote pricing facts", async () => {
        mocks.auth.userData = { id: "user-1" };
        mocks.httpGet.mockResolvedValue({ status: 200, data: { valid: true, cartItems: [{ ...cart[0], sale_price: 90 }] } });
        renderCheckout();
        fillRequiredFields();
        fireEvent.click(screen.getByDisplayValue("cash"));
        await waitFor(() => expect(screen.getByRole("button", { name: "Place order" })).toBeEnabled());
        fireEvent.click(screen.getByRole("button", { name: "Place order" }));

        await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("checkout.priceChanged"));
        expect(await screen.findByRole("alert")).toHaveTextContent("checkout.priceChanged");
        expect(mocks.httpPost).not.toHaveBeenCalledWith("/api/orders/purchase/user-1", expect.anything());
    });

    it("announces checkout validation errors to assistive technology", async () => {
        renderCheckout();
        fireEvent.click(screen.getByRole("button", { name: "Request test quote" }));
        fireEvent.click(screen.getByDisplayValue("cash"));
        await waitFor(() => expect(screen.getByRole("button", { name: "Place order" })).toBeEnabled());
        fireEvent.click(screen.getByRole("button", { name: "Place order" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Email is required");
        expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive");
    });
});
