import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CustomerAccountPage from "./CustomerAccountPage";

const mocks = vi.hoisted(() => ({
    auth: {
        userData: {
            id: "customer-1",
            email: "customer@example.com",
            username: "demo_customer",
            first_name: "Demo",
            last_name: "Customer",
        },
    },
    toast: { addToast: vi.fn() },
    users: {
        fetchCurrentCustomer: vi.fn(),
        fetchCustomerAddresses: vi.fn(),
        fetchCustomerNotifications: vi.fn(),
        markCustomerNotificationRead: vi.fn(),
        markAllCustomerNotificationsRead: vi.fn(),
        resendVerification: vi.fn(),
        requestEmailChange: vi.fn(),
    },
    orders: { fetchCustomerOrders: vi.fn() },
    firebase: { sendFirebaseEmailVerification: vi.fn() },
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
    resendVerification: mocks.users.resendVerification,
}));

vi.mock("../../orders/api", () => ({
    fetchCustomerOrders: mocks.orders.fetchCustomerOrders,
}));

vi.mock("../../auth/api", () => ({
    resendVerification: mocks.users.resendVerification,
    requestEmailChange: mocks.users.requestEmailChange,
}));

vi.mock("../../../services/firebase", () => ({
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
        mocks.users.requestEmailChange.mockResolvedValue(undefined);
    });

    it("renders notification updates inside the account page", async () => {
        render(
            <MemoryRouter initialEntries={["/account"]}>
                <CustomerAccountPage />
            </MemoryRouter>,
        );

        expect(await screen.findByRole("heading", { name: "My account" })).toBeInTheDocument();
        expect(await screen.findByRole("heading", { name: "Notification updates" })).toBeInTheDocument();
        expect(await screen.findByRole("button", { name: "Order #7 was placed" })).toBeInTheDocument();
        expect(mocks.users.fetchCustomerNotifications).toHaveBeenCalledWith("customer-1", 10);
    });

    it("marks an account notification as read and opens its details", async () => {
        render(
            <MemoryRouter initialEntries={["/account"]}>
                <CustomerAccountPage />
            </MemoryRouter>,
        );

        fireEvent.click(await screen.findByRole("button", { name: "Order #7 was placed" }));
        expect(await screen.findByText("Your order is being prepared.")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Open details" })).toHaveAttribute("href", "/orders?order=7");

        fireEvent.click(screen.getByRole("button", { name: "Mark Order #7 was placed as read" }));
        await waitFor(() => expect(mocks.users.markCustomerNotificationRead).toHaveBeenCalledWith("customer-1", 7));
        expect(screen.getByRole("button", { name: "Order #7 was placed is read" })).toBeDisabled();
    });

    it("requests an email change from the account page", async () => {
        render(
            <MemoryRouter initialEntries={["/account"]}>
                <CustomerAccountPage />
            </MemoryRouter>,
        );

        expect(await screen.findByRole("heading", { name: "My account" })).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText("New email"), {
            target: { value: "new@example.com" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Send email-change link" }));

        await waitFor(() => expect(mocks.users.requestEmailChange).toHaveBeenCalledWith("new@example.com"));
        expect(await screen.findByRole("status")).toHaveTextContent("Check your new email to confirm the change.");
    });
});
