import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppRouter from "./router";
import { Role, type UserData } from "../types/user";

const authState = vi.hoisted(() => ({
    value: { loading: false, userData: null as UserData },
}));

vi.mock("../context/AuthContext", () => ({
    useAuth: () => ({ ...authState.value, setUserData: vi.fn() }),
}));

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

vi.mock("../features/admin/pages/AdminDashboard", () => ({
    default: () => <div data-testid="admin-dashboard-page">Admin dashboard</div>,
}));

vi.mock("../features/admin/pages/AdminSupportPage", () => ({ default: () => <div>Admin support</div> }));
vi.mock("../features/admin/pages/AdminProductPage", () => ({ default: () => <div>Admin products</div> }));
vi.mock("../features/admin/pages/AdminOrderPage", () => ({ default: () => <div>Admin orders</div> }));
vi.mock("../features/admin/pages/AdminAccountPage", () => ({ default: () => <div>Admin accounts</div> }));
vi.mock("../features/admin/pages/AdminPromotionsPage", () => ({ default: () => <div>Admin promotions</div> }));
vi.mock("../features/admin/pages/AdminAddProductPage", () => ({ default: () => <div>Admin add product</div> }));

vi.mock("../features/auth/pages/LoginPage", () => ({
    default: () => {
        const location = useLocation();
        return <div data-testid="login-location">{location.pathname + location.search}</div>;
    },
}));

const adminPaths = [
    "/admin",
    "/admin/notifications",
    "/admin/support",
    "/admin/products",
    "/admin/orders",
    "/admin/accounts",
    "/admin/promotions",
    "/admin/add",
] as const;

const buildUser = (role: Role): NonNullable<UserData> => ({
    id: "user-1",
    email: "user@example.com",
    username: "user",
    first_name: "Test",
    last_name: "User",
    role,
    created_at: new Date("2026-01-01"),
    last_login: new Date("2026-01-01"),
});

beforeEach(() => {
    authState.value = { loading: false, userData: null };
});

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

describe("admin routing", () => {
    it.each(adminPaths)("blocks anonymous access to %s", async (path) => {
        render(
            <MemoryRouter initialEntries={[path]}>
                <AppRouter />
            </MemoryRouter>,
        );

        expect(await screen.findByTestId("login-location")).toHaveTextContent(
            "/login?redirect=" + encodeURIComponent(path),
        );
    });

    it("blocks a Customer from Admin pages", async () => {
        authState.value = { loading: false, userData: buildUser(Role.Customer) };
        render(
            <MemoryRouter initialEntries={["/admin/orders"]}>
                <AppRouter />
            </MemoryRouter>,
        );

        expect(await screen.findByRole("heading", { name: "Access denied" })).toBeInTheDocument();
    });

    it("redirects the retired admin notifications route to the dashboard", async () => {
        authState.value = { loading: false, userData: buildUser(Role.Admin) };
        render(
            <MemoryRouter initialEntries={["/admin/notifications"]}>
                <AppRouter />
            </MemoryRouter>,
        );

        expect(await screen.findByTestId("admin-dashboard-page")).toBeInTheDocument();
    });

    it("keeps the forbidden route public", async () => {
        render(
            <MemoryRouter initialEntries={["/403"]}>
                <AppRouter />
            </MemoryRouter>,
        );

        expect(await screen.findByRole("heading", { name: "Access denied" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Go to home" })).toHaveAttribute("href", "/");
        expect(screen.getByRole("link", { name: "Go to account" })).toHaveAttribute("href", "/account");
    });
});
