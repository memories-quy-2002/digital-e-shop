import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AppRouter from "./router";

vi.mock("../features/auth/components/withSessionCheck", () => ({
    default: (Component: React.ComponentType) => (props: Record<string, unknown>) => (
        <div data-testid="protected-route">
            <Component {...props} />
        </div>
    ),
}));

vi.mock("../features/orders/pages/CartPage", () => ({
    default: () => <div data-testid="public-cart-page">Cart page</div>,
}));

vi.mock("../features/orders/pages/CheckoutSuccessPage", () => ({
    default: () => <div data-testid="public-checkout-success-page">Checkout success</div>,
}));

vi.mock("../features/orders/pages/GuestOrderLookupPage", () => ({
    default: () => <div data-testid="public-guest-order-page">Guest order lookup</div>,
}));

vi.mock("../features/users/pages/CustomerAccountPage", () => ({
    default: () => <div data-testid="account-page">Account page</div>,
}));

vi.mock("../pages/WishlistPage", () => ({
    default: () => <div data-testid="wishlist-page">Wishlist page</div>,
}));

describe("cart routing", () => {
    it("renders /cart without the protected route wrapper", async () => {
        render(
            <MemoryRouter initialEntries={["/cart"]}>
                <AppRouter />
            </MemoryRouter>,
        );

        expect(await screen.findByTestId("public-cart-page")).toBeInTheDocument();
        expect(screen.queryByTestId("protected-route")).not.toBeInTheDocument();
    });

    it("keeps account routes protected", async () => {
        render(
            <MemoryRouter initialEntries={["/account"]}>
                <AppRouter />
            </MemoryRouter>,
        );

        expect(await screen.findByTestId("protected-route")).toBeInTheDocument();
        expect(await screen.findByTestId("account-page")).toBeInTheDocument();
    });

    it("keeps wishlist routes protected", async () => {
        render(
            <MemoryRouter initialEntries={["/wishlist"]}>
                <AppRouter />
            </MemoryRouter>,
        );

        expect(await screen.findByTestId("protected-route")).toBeInTheDocument();
        expect(await screen.findByTestId("wishlist-page")).toBeInTheDocument();
    });

    it("keeps checkout success and guest order lookup public", async () => {
        const successView = render(
            <MemoryRouter initialEntries={["/checkout-success"]}>
                <AppRouter />
            </MemoryRouter>,
        );

        expect(await screen.findByTestId("public-checkout-success-page")).toBeInTheDocument();
        expect(screen.queryByTestId("protected-route")).not.toBeInTheDocument();
        successView.unmount();

        render(
            <MemoryRouter initialEntries={["/guest-order"]}>
                <AppRouter />
            </MemoryRouter>,
        );

        expect(await screen.findByTestId("public-guest-order-page")).toBeInTheDocument();
        expect(screen.queryByTestId("protected-route")).not.toBeInTheDocument();
    });
});
