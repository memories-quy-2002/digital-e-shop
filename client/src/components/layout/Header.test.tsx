import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Header } from "./Header";
import { LocaleProvider } from "../../context/LocaleContext";

const mocks = vi.hoisted(() => ({
    auth: {
        userData: null as { id: string; role?: "Admin" | "Customer"; username?: string } | null,
        loading: false,
        setUserData: vi.fn(),
    },
    cart: {
        items: [] as unknown[],
        totalPrice: 0,
        discount: 0,
        subtotal: 0,
        isLoading: false,
        error: null as string | null,
        fetchCart: vi.fn(),
    },
    toast: { addToast: vi.fn() },
    notifications: { fetchCustomerNotifications: vi.fn(), logoutCurrentCustomer: vi.fn() },
    products: { searchProducts: vi.fn() },
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

vi.mock("../../features/users/api", () => ({
    fetchCustomerNotifications: mocks.notifications.fetchCustomerNotifications,
    logoutCurrentCustomer: mocks.notifications.logoutCurrentCustomer,
}));
vi.mock("../../features/products/api", () => ({ searchProducts: mocks.products.searchProducts }));

vi.mock("../../services/firebase", () => ({
    signOutFirebaseUser: vi.fn(),
}));

vi.mock("../common/ColorSchemeDropdown", () => ({ default: () => <div /> }));
vi.mock("../common/LanguageDropdown", () => ({ default: () => <div /> }));
vi.mock("../../hooks/useKeyboardShortcut", () => ({
    useKeyboardShortcut: vi.fn(),
}));

vi.mock("./HeaderMobileSheet", () => ({
    default: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? <>{children}</> : null,
}));

vi.mock("../ui/sheet", () => ({
    Sheet: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? <>{children}</> : null,
    SheetContent: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
        <div role="dialog" {...props}>{children}</div>
    ),
    SheetHeader: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => <div {...props}>{children}</div>,
    SheetTitle: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => <h2 {...props}>{children}</h2>,
    SheetDescription: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => <p {...props}>{children}</p>,
}));

const LocationProbe = () => {
    const location = useLocation();
    return <span data-testid="location">{location.pathname + location.search + location.hash}</span>;
};

const renderHeader = () => render(
    <MemoryRouter initialEntries={["/"]}>
        <LocaleProvider>
            <Header />
            <LocationProbe />
        </LocaleProvider>
    </MemoryRouter>,
);

describe("Header navigation controls", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.auth.userData = null;
        mocks.auth.loading = false;
        mocks.cart.items = [];
        mocks.cart.totalPrice = 0;
        mocks.cart.discount = 0;
        mocks.cart.subtotal = 0;
        mocks.cart.isLoading = false;
        mocks.cart.error = null;
        mocks.products.searchProducts.mockResolvedValue([]);
        mocks.notifications.fetchCustomerNotifications.mockResolvedValue({ notifications: [], unread: 0 });
    });

    it("sends a guest to login when opening notifications", () => {
        renderHeader();

        fireEvent.click(screen.getByRole("button", { name: "Notifications" }));

        expect(screen.getByTestId("location")).toHaveTextContent("/login?redirect=%2Faccount%2Fnotifications");
        expect(mocks.toast.addToast).not.toHaveBeenCalledWith("Login required", expect.anything());
    });

    it("opens the notification preview and navigates to the full page from View all", async () => {
        mocks.auth.userData = { id: "customer-1", role: "Customer", username: "demo_customer" };
        mocks.notifications.fetchCustomerNotifications.mockResolvedValue({
            unread: 1,
            notifications: [
                {
                    id: 7,
                    type: "order",
                    title: "Order shipped",
                    message: "Your order is on its way.",
                    link: "/orders?order=7",
                    read_at: null,
                    created_at: "2026-09-10T08:00:00.000Z",
                    is_read: false,
                },
            ],
        });
        renderHeader();

        fireEvent.click(screen.getByRole("button", { name: "Notifications" }));

        expect(await screen.findByRole("dialog", { name: "Notifications" })).toBeInTheDocument();
        expect(await screen.findByText("Order shipped")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("link", { name: "View all" }));

        expect(screen.getByTestId("location")).toHaveTextContent("/account/notifications");
    });

    it("opens a quick cart preview and lets a guest continue to the full cart", async () => {
        renderHeader();

        fireEvent.click(screen.getByRole("button", { name: "Open cart preview" }));

        expect(await screen.findByRole("dialog", { name: "Your cart" })).toBeInTheDocument();
        expect(await screen.findByText("Your cart is empty")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("link", { name: "View full cart" }));
        expect(screen.getByTestId("location")).toHaveTextContent("/cart");
        expect(mocks.toast.addToast).not.toHaveBeenCalledWith("Login required", expect.anything());
    });

    it("shows cart items and closes the preview when opening a product", async () => {
        mocks.cart.items = [{
            cartItemId: 1,
            productId: 42,
            productName: "Noise Cancelling Headphones",
            category: "Audio",
            brand: "Bose",
            price: 180000,
            sale_price: null,
            main_image: "headphones.jpg",
            quantity: 2,
            stock: 5,
        }];
        mocks.cart.totalPrice = 360000;
        mocks.cart.subtotal = 360000;
        renderHeader();

        fireEvent.click(screen.getByRole("button", { name: "Open cart preview" }));

        expect(await screen.findByText("Noise Cancelling Headphones")).toBeInTheDocument();
        expect(screen.getByText("Qty: 2")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("link", { name: "Noise Cancelling Headphones" }));

        expect(screen.getByTestId("location")).toHaveTextContent("/product?id=42");
        expect(screen.queryByRole("dialog", { name: "Your cart" })).not.toBeInTheDocument();
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

    it("shows admins a desktop shortcut back to the admin panel", () => {
        mocks.auth.userData = { id: "admin-1", role: "Admin", username: "demo_admin" };
        renderHeader();

        fireEvent.click(screen.getByRole("button", { name: "Open profile menu" }));
        fireEvent.click(screen.getByRole("button", { name: "Back to Admin" }));

        expect(screen.getByTestId("location")).toHaveTextContent("/admin");
    });

    it("shows the same admin shortcut in the mobile menu and hides it for customers", () => {
        mocks.auth.userData = { id: "admin-1", role: "Admin", username: "demo_admin" };
        renderHeader();

        fireEvent.click(screen.getByRole("button", { name: "Toggle menu" }));
        fireEvent.click(screen.getByRole("button", { name: "Back to Admin" }));
        expect(screen.getByTestId("location")).toHaveTextContent("/admin");

        cleanup();
        mocks.auth.userData = { id: "customer-1", role: "Customer", username: "demo_customer" };
        renderHeader();

        fireEvent.click(screen.getByRole("button", { name: "Open profile menu" }));
        expect(screen.queryByRole("button", { name: "Back to Admin" })).toBeNull();
    });
});
