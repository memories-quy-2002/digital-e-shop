import React from "react";
import { render, screen } from "@testing-library/react";
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

vi.mock("react-helmet", () => ({
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

    it("surfaces a merge action when a signed-in user still has guest cart items", () => {
        mocks.cart.isGuest = false;
        mocks.cart.hasGuestItems = true;

        renderPage();

        expect(screen.getByRole("region", { name: /guest cart/i })).toHaveTextContent(/guest cart/i);
        expect(screen.getByRole("button", { name: /merge guest cart/i })).toBeInTheDocument();
    });
});
