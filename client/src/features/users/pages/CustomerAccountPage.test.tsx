import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../../context/LocaleContext";
import CustomerAccountPage from "./CustomerAccountPage";

const mocks = vi.hoisted(() => ({
    auth: {
        userData: {
            id: "customer-1",
            email: "customer@example.com",
            username: "demo_customer",
            first_name: "Demo",
            last_name: "Customer",
            email_verified: false,
        },
    },
    toast: { addToast: vi.fn() },
    users: {
        fetchCurrentCustomer: vi.fn(),
        fetchCustomerAddresses: vi.fn(),
        fetchCustomerNotifications: vi.fn(),
        markCustomerNotificationRead: vi.fn(),
        markAllCustomerNotificationsRead: vi.fn(),
    },
    orders: { fetchCustomerOrders: vi.fn() },
    firebase: {
        sendFirebaseEmailChangeVerification: vi.fn(),
        sendFirebaseEmailVerification: vi.fn(),
    },
}));

vi.mock("../../../context/AuthContext", () => ({
    useAuth: () => ({ userData: mocks.auth.userData, loading: false }),
}));

vi.mock("../../../context/ToastContext", () => ({
    useToast: () => mocks.toast,
}));

vi.mock("../../../components/layout/Layout", () => ({
    default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("../components/CustomerAccountShell", () => ({
    default: ({ title, description }: { title: string; description?: string }) => (
        <section>
            <h1>{title}</h1>
            {description ? <p>{description}</p> : null}
        </section>
    ),
}));

vi.mock("../api", () => ({
    fetchCurrentCustomer: mocks.users.fetchCurrentCustomer,
    fetchCustomerAddresses: mocks.users.fetchCustomerAddresses,
    fetchCustomerNotifications: mocks.users.fetchCustomerNotifications,
    markCustomerNotificationRead: mocks.users.markCustomerNotificationRead,
    markAllCustomerNotificationsRead: mocks.users.markAllCustomerNotificationsRead,
}));

vi.mock("../../orders/api", () => ({
    fetchCustomerOrders: mocks.orders.fetchCustomerOrders,
}));

vi.mock("../../../services/firebase", () => ({
    sendFirebaseEmailChangeVerification: mocks.firebase.sendFirebaseEmailChangeVerification,
    sendFirebaseEmailVerification: mocks.firebase.sendFirebaseEmailVerification,
}));
vi.mock("../../../components/common/Icons", () => ({
    CartIcon: () => <span aria-hidden="true" />,
    HouseIcon: () => <span aria-hidden="true" />,
    BellIcon: () => <span aria-hidden="true" />,
    PersonIcon: () => <span aria-hidden="true" />,
}));

vi.mock("../../../components/common/EmptyState", () => ({
    default: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock("react-helmet-async", () => ({
    Helmet: () => null,
}));

describe("CustomerAccountPage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.removeItem("digital-e:locale:v1");
        mocks.users.fetchCurrentCustomer.mockResolvedValue({
            id: "customer-1",
            email: "customer@example.com",
            username: "demo_customer",
            first_name: "Demo",
            last_name: "Customer",
            role: "Customer",
            created_at: "2026-01-01T00:00:00.000Z",
            last_login: "2026-09-10T08:00:00.000Z",
        });
        mocks.users.fetchCustomerAddresses.mockResolvedValue([]);
        mocks.users.fetchCustomerNotifications.mockResolvedValue({
            notifications: [
                {
                    id: 7,
                    type: "order",
                    title: "Order #7 was placed",
                    message: "Your order is being prepared.",
                    link: "/orders?order=7",
                    read_at: null,
                    created_at: "2026-09-10T08:00:00.000Z",
                    is_read: false,
                },
            ],
            unread: 1,
        });
        mocks.users.markCustomerNotificationRead.mockResolvedValue({ updated: 1 });
        mocks.users.markAllCustomerNotificationsRead.mockResolvedValue({ updated: 1 });
        mocks.orders.fetchCustomerOrders.mockResolvedValue([]);
        mocks.firebase.sendFirebaseEmailChangeVerification.mockResolvedValue(undefined);
        mocks.firebase.sendFirebaseEmailVerification.mockResolvedValue(undefined);
    });

    it("renders notification updates inside the account page", async () => {
        render(
            <LocaleProvider>
                <MemoryRouter initialEntries={["/account"]}>
                    <CustomerAccountPage />
                </MemoryRouter>
            </LocaleProvider>,
        );

        expect(await screen.findByRole("heading", { name: "My account" })).toBeInTheDocument();
        expect(await screen.findByRole("heading", { name: "Notification updates" })).toBeInTheDocument();
        expect(await screen.findByRole("button", { name: "Order #7 was placed" })).toBeInTheDocument();
        expect(mocks.users.fetchCustomerNotifications).toHaveBeenCalledWith("customer-1", 10);
    });

    it("marks an account notification as read and opens its details", async () => {
        render(
            <LocaleProvider>
                <MemoryRouter initialEntries={["/account"]}>
                    <CustomerAccountPage />
                </MemoryRouter>
            </LocaleProvider>,
        );

        fireEvent.click(await screen.findByRole("button", { name: "Order #7 was placed" }));
        expect(await screen.findByText("Your order is being prepared.")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Open details" })).toHaveAttribute("href", "/orders?order=7");

        fireEvent.click(screen.getByRole("button", { name: "Mark Order #7 was placed as read" }));
        await waitFor(() => expect(mocks.users.markCustomerNotificationRead).toHaveBeenCalledWith("customer-1", 7));
        expect(screen.getByRole("button", { name: "Order #7 was placed is read" })).toBeDisabled();
    });

    it("localizes product alert notifications from typed metadata", async () => {
        mocks.users.fetchCustomerNotifications.mockResolvedValue({
            notifications: [
                {
                    id: 21,
                    type: "price_drop",
                    title: "Product alert",
                    message: "A saved product changed price.",
                    link: "/product?id=42",
                    metadata: {
                        productName: "Camera One",
                        currentPrice: 1234567,
                        previousPrice: 1400000,
                    },
                    read_at: null,
                    created_at: "2026-09-10T08:00:00.000Z",
                    is_read: false,
                },
                {
                    id: 22,
                    type: "back_in_stock",
                    title: "Product alert",
                    message: "A saved product is available again.",
                    link: "/product?id=43",
                    metadata: { productName: "Keyboard Two" },
                    read_at: null,
                    created_at: "2026-09-10T08:00:00.000Z",
                    is_read: false,
                },
            ],
            unread: 2,
        });

        render(
            <LocaleProvider>
                <MemoryRouter initialEntries={["/account/notifications"]}>
                    <CustomerAccountPage />
                </MemoryRouter>
            </LocaleProvider>,
        );

        expect(await screen.findByRole("button", { name: "Camera One price dropped" })).toBeInTheDocument();
        expect(await screen.findByRole("button", { name: "Keyboard Two is back in stock" })).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Camera One price dropped" }));
        expect(await screen.findByText(/Camera One is now 1\.234\.567/)).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Open details" })).toHaveAttribute("href", "/product?id=42");
    });

    it("falls back to server copy when product alert metadata is incomplete", async () => {
        mocks.users.fetchCustomerNotifications.mockResolvedValue({
            notifications: [{
                id: 23,
                type: "price_drop",
                title: "Saved product update",
                message: "The product alert could not be expanded.",
                link: "/product?id=44",
                metadata: { productName: "Camera Three", currentPrice: "not-a-price" },
                read_at: null,
                created_at: "2026-09-10T08:00:00.000Z",
                is_read: false,
            }],
            unread: 1,
        });

        render(
            <LocaleProvider>
                <MemoryRouter initialEntries={["/account/notifications"]}>
                    <CustomerAccountPage />
                </MemoryRouter>
            </LocaleProvider>,
        );

        fireEvent.click(await screen.findByRole("button", { name: "Saved product update" }));
        expect(await screen.findByText("The product alert could not be expanded.")).toBeInTheDocument();
        expect(screen.queryByText(/undefined|0 ₫/i)).not.toBeInTheDocument();
    });

    it("requests an email change through Firebase from the account page", async () => {
        render(
            <LocaleProvider>
                <MemoryRouter initialEntries={["/account"]}>
                    <CustomerAccountPage />
                </MemoryRouter>
            </LocaleProvider>,
        );

        expect(await screen.findByRole("heading", { name: "My account" })).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText("New email"), {
            target: { value: "new@example.com" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Send email-change link" }));

        await waitFor(() => expect(mocks.firebase.sendFirebaseEmailChangeVerification).toHaveBeenCalledWith("new@example.com"));
        expect(await screen.findByRole("status")).toHaveTextContent("Check your new email to confirm the change.");
    });

    it("resends verification through the signed-in Firebase user", async () => {
        render(
            <LocaleProvider>
                <MemoryRouter initialEntries={["/account"]}>
                    <CustomerAccountPage />
                </MemoryRouter>
            </LocaleProvider>,
        );

        expect(await screen.findByRole("heading", { name: "My account" })).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Resend verification email" }));

        await waitFor(() => expect(mocks.firebase.sendFirebaseEmailVerification).toHaveBeenCalledTimes(1));
    });

    it("renders account content in Vietnamese when the locale is vi", async () => {
        window.localStorage.setItem("digital-e:locale:v1", JSON.stringify("vi"));

        render(
            <LocaleProvider>
                <MemoryRouter initialEntries={["/account"]}>
                    <CustomerAccountPage />
                </MemoryRouter>
            </LocaleProvider>,
        );

        expect(await screen.findByRole("heading", { name: "\u0054\u00e0i kho\u1ea3n c\u1ee7a t\u00f4i" })).toBeInTheDocument();
        expect(await screen.findByRole("heading", { name: "C\u1eadp nh\u1eadt th\u00f4ng b\u00e1o" })).toBeInTheDocument();

        window.localStorage.removeItem("digital-e:locale:v1");
    });
});
