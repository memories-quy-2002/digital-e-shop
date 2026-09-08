import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Header } from "./Header";
import { LocaleProvider } from "../../context/LocaleContext";

const mocks = vi.hoisted(() => ({
    auth: {
        userData: null as { id: string } | null,
        loading: false,
        setUserData: vi.fn(),
    },
    cart: { items: [] as unknown[] },
    toast: { addToast: vi.fn() },
    axios: { get: vi.fn(), post: vi.fn() },
}));

vi.mock("../../context/AuthContext", () => ({
    useAuth: () => mocks.auth,
}));

vi.mock("../../context/CartContext", () => ({
    useCart: () => mocks.cart,
}));

vi.mock("../../context/ToastContext", () => ({
    useToast: () => mocks.toast,
}));

vi.mock("../../api/axios", () => ({ default: mocks.axios }));

vi.mock("../../features/users/api", () => ({
    fetchCustomerNotifications: vi.fn(),
}));

vi.mock("../../services/firebase", () => ({
    signOutFirebaseUser: vi.fn(),
}));

vi.mock("../common/ColorSchemeDropdown", () => ({ default: () => <div /> }));
vi.mock("../common/LanguageDropdown", () => ({ default: () => <div /> }));
vi.mock("../../hooks/useKeyboardShortcut", () => ({
    useKeyboardShortcut: vi.fn(),
}));

vi.mock("../ui/sheet", () => ({
    Sheet: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? <>{children}</> : null,
    SheetContent: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
        <div {...props}>{children}</div>
    ),
}));

const LocationProbe = () => {
    const location = useLocation();
    return <span data-testid="location">{location.pathname}</span>;
};

const renderHeader = () => render(
    <MemoryRouter initialEntries={["/"]}>
        <LocaleProvider>
            <Header />
            <LocationProbe />
        </LocaleProvider>
    </MemoryRouter>,
);

describe("Header cart navigation", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.auth.userData = null;
        mocks.auth.loading = false;
        mocks.cart.items = [];
        mocks.axios.get.mockResolvedValue({ status: 200, data: { products: [] } });
    });

    it("lets a guest open the cart from the desktop control", () => {
        renderHeader();

        fireEvent.click(screen.getByRole("button", { name: "Cart" }));

        expect(screen.getByTestId("location")).toHaveTextContent("/cart");
        expect(mocks.toast.addToast).not.toHaveBeenCalledWith("Login required", expect.anything());
    });

    it("lets a guest open the cart from the profile menu", () => {
        renderHeader();

        fireEvent.click(screen.getByRole("button", { name: "Open profile menu" }));
        const cartButtons = screen.getAllByRole("button", { name: "Cart" });
        fireEvent.click(cartButtons[cartButtons.length - 1]);

        expect(screen.getByTestId("location")).toHaveTextContent("/cart");
    });

    it("lets a guest open the cart from the mobile menu while keeping wishlist protected", () => {
        renderHeader();

        fireEvent.click(screen.getByRole("button", { name: "Toggle menu" }));
        const mobileCart = screen.getAllByRole("button", { name: "Cart" }).at(-1);
        expect(mobileCart).toBeDefined();
        fireEvent.click(mobileCart!);
        expect(screen.getByTestId("location")).toHaveTextContent("/cart");

        cleanup();
        renderHeader();
        fireEvent.click(screen.getByRole("button", { name: "Toggle menu" }));
        fireEvent.click(screen.getByRole("button", { name: "Wishlist" }));
        expect(screen.getByTestId("location")).toHaveTextContent("/");
        expect(mocks.toast.addToast).toHaveBeenCalledWith("Login required", "You need to login to use this feature");
    });
});
