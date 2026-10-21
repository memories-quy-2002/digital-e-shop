import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../../context/LocaleContext";
import type { CartStatus } from "../../../context/CartContext";
import type { CartValidationIssue, CheckoutCartItem } from "../types";
import CartPage from "./CartPage";

const mocks = vi.hoisted(() => ({
    cart: {
        items: [] as CheckoutCartItem[],
        totalPrice: 0,
        discount: 0,
        discountCode: null,
        subtotal: 0,
        validationIssues: [] as CartValidationIssue[],
        status: "empty" as CartStatus,
        error: null as string | null,
        isLoading: false,
        isRemovingItem: false,
        pendingRemoveItem: null,
        isGuest: true,
        hasGuestItems: false,
        mergeStatus: "idle",
        mergeGuestCart: vi.fn(),
        updateQuantity: vi.fn(),
        removeItem: vi.fn(),
        confirmRemoveItem: vi.fn(),
        cancelRemoveItem: vi.fn(),
        applyDiscount: vi.fn(),
        validateBeforeCheckout: vi.fn(),
        onValidationRefresh: vi.fn(),
        fetchCart: vi.fn(),
    },
    addToast: vi.fn(),
}));

vi.mock("../../../context/CartContext", () => ({
    useCart: () => mocks.cart,
}));

vi.mock("../../../context/ToastContext", () => ({
    useToast: () => ({ addToast: mocks.addToast }),
}));

vi.mock("../../../components/layout/Layout", () => ({
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../../../components/common/LoadingScreen", () => ({
    default: () => <div role="status">Loading cart</div>,
}));

vi.mock("../../../components/common/AsideCart", () => ({
    default: () => <aside>Cart summary</aside>,
}));

vi.mock("../../../components/common/CartItem", () => ({
    default: ({ item, validationIssue }: { item: { productName: string }; validationIssue?: { reason: string } }) => (
        <article>
            {item.productName}
            {validationIssue ? <span role="alert">{validationIssue.reason}</span> : null}
        </article>
    ),
}));

vi.mock("../../../components/common/ConfirmActionModal", () => ({
    default: () => null,
}));

vi.mock("../../../components/common/Icons", () => ({
    ArrowLeftIcon: () => null,
    ArrowRightIcon: () => null,
    CartIcon: () => null,
}));

vi.mock("../../../components/ui/legacy", () => ({
    Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
    Container: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
    Modal: Object.assign(() => null, { Header: () => null, Title: () => null, Body: () => null, Footer: () => null }),
}));

vi.mock("../components/CheckoutPaymentPage", () => ({
    default: () => null,
}));

vi.mock("react-helmet-async", () => ({
    Helmet: () => null,
}));

const renderPage = () => render(
    <MemoryRouter>
        <LocaleProvider>
            <CartPage />
        </LocaleProvider>
    </MemoryRouter>,
);

describe("public cart states", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.removeItem("digital-e:locale:v1");
        mocks.cart.mergeGuestCart.mockResolvedValue({ complete: true, accepted: [], rejected: [] });
        mocks.cart.items = [];
        mocks.cart.totalPrice = 0;
        mocks.cart.discount = 0;
        mocks.cart.discountCode = null;
        mocks.cart.subtotal = 0;
        mocks.cart.validationIssues = [];
        mocks.cart.status = "empty";
        mocks.cart.error = null;
        mocks.cart.isLoading = false;
        mocks.cart.isGuest = true;
        mocks.cart.hasGuestItems = false;
        mocks.cart.mergeStatus = "idle";
    });

    it("gives an empty cart a focused state and a clear next step", () => {
        renderPage();

        expect(screen.getByRole("heading", { name: "Your cart", level: 1 })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Your cart is empty", level: 2 })).toBeInTheDocument();
        expect(screen.getAllByText("Find the next useful piece for your setup.")).toHaveLength(1);
        expect(screen.getByRole("link", { name: "Shop now" })).toHaveAttribute("href", "/shops");
        expect(screen.queryByRole("heading", { name: "0 items", level: 3 })).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Order summary")).not.toBeInTheDocument();
    });

    it("renders a recoverable preview error instead of an empty cart", () => {
        mocks.cart.status = "error";
        mocks.cart.error = "Unable to load cart right now.";

        renderPage();

        expect(screen.getByRole("alert")).toHaveTextContent("Unable to load cart right now.");
        expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    });

    it("renders an unavailable product issue in the public cart", () => {
        mocks.cart.status = "validation-error";
        mocks.cart.items = [{
            cartItemId: 1,
            productId: 1,
            productName: "Unavailable widget",
            category: "Components",
            brand: "Digital-E",
            price: 100,
            sale_price: null,
            main_image: "",
            quantity: 1,
            stock: 0,
            available_stock: 0,
        }];
        mocks.cart.validationIssues = [{
            productId: 1,
            cartItemId: 1,
            productName: "Unavailable widget",
            requestedQuantity: 1,
            availableStock: 0,
            reason: "unavailable",
        }];

        renderPage();

        expect(screen.getByText("Unavailable widget")).toBeInTheDocument();
        expect(screen.getByText("unavailable")).toBeInTheDocument();
    });

    it("keeps the continue-shopping action in the item-list header when the cart has items", () => {
        mocks.cart.items = [{
            cartItemId: 1,
            productId: 1,
            productName: "Cart test item",
            category: "Components",
            brand: "Digital-E",
            price: 100,
            sale_price: null,
            main_image: "",
            quantity: 1,
            stock: 5,
            available_stock: 5,
        }];
        mocks.cart.status = "ready";

        renderPage();

        const listHeader = screen.getByRole("heading", { name: "1 item", level: 3 }).parentElement;
        expect(listHeader).toContainElement(screen.getByRole("button", { name: /continue shopping/i }));
        expect(screen.queryByText("Delivery fee is calculated at checkout")).not.toBeInTheDocument();
    });

    it("surfaces a merge action when a signed-in user still has guest cart items", () => {
        mocks.cart.isGuest = false;
        mocks.cart.hasGuestItems = true;

        renderPage();

        expect(screen.getByRole("region", { name: /guest cart/i })).toHaveTextContent(/guest cart/i);
        expect(screen.getByRole("button", { name: /merge guest cart/i })).toBeInTheDocument();
    });

    it("uses the selected locale for guest-cart merge feedback", async () => {
        window.localStorage.setItem("digital-e:locale:v1", JSON.stringify("vi"));
        mocks.cart.isGuest = false;
        mocks.cart.hasGuestItems = true;

        renderPage();

        fireEvent.click(await screen.findByRole("button", { name: "Gộp giỏ hàng khách" }));

        await waitFor(() => expect(mocks.addToast).toHaveBeenCalledWith(
            "Giỏ hàng khách",
            "Các sản phẩm trong giỏ khách đã được gộp thành công.",
        ));
    });
});
