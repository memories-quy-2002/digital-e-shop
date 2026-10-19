import { renderWithLocale } from '../../test-utils/renderWithLocale';
import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminHeader from "./AdminHeader";
import { acknowledgeAdminAlerts, fetchAdminAlerts } from "../../features/admin/api";

const mocks = vi.hoisted(() => ({
    addToast: vi.fn(),
    navigate: vi.fn(),
    logoutCurrentCustomer: vi.fn(),
}));

vi.mock("../../features/admin/api", () => ({ fetchAdminAlerts: vi.fn(), acknowledgeAdminAlerts: vi.fn() }));
vi.mock("../../context/AuthContext", () => ({
    useAuth: () => ({ userData: { username: "admin", role: "Admin" }, loading: false }),
}));
vi.mock("../../context/ToastContext", () => ({ useToast: () => ({ addToast: mocks.addToast }) }));
vi.mock("../../features/users/api", () => ({ logoutCurrentCustomer: mocks.logoutCurrentCustomer }));
vi.mock("../../services/firebase", () => ({ signOutFirebaseUser: vi.fn() }));
vi.mock("react-router-dom", async () => ({
    ...(await vi.importActual<typeof import("react-router-dom")>("react-router-dom")),
    useNavigate: () => mocks.navigate,
}));

const renderHeader = () => renderWithLocale(
    <MemoryRouter>
        <AdminHeader />
    </MemoryRouter>,
);

const alert = {
    id: "alert-1",
    type: "order" as const,
    title: "Order requires review",
    description: "Order #42 is pending.",
    createdAt: "2026-09-08T10:00:00.000Z",
    unread: true,
    priority: "High" as const,
    actionLabel: "Review",
    route: "/admin/orders",
};

describe("AdminHeader activity feed request states", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(acknowledgeAdminAlerts).mockResolvedValue(undefined);
        mocks.logoutCurrentCustomer.mockResolvedValue({});
        window.localStorage.clear();
        document.documentElement.removeAttribute("data-theme");
        document.documentElement.style.colorScheme = "";
    });

    it("switches the admin interface between English and Vietnamese", async () => {
        vi.mocked(fetchAdminAlerts).mockResolvedValue({ alerts: [], unread: 0 });
        renderHeader();

        fireEvent.click(screen.getByRole("button", { name: "English / Tiếng Việt" }));
        fireEvent.click(screen.getByRole("option", { name: /Tiếng Việt/ }));

        const search = await screen.findByRole("combobox", { name: "Đi tới trang quản trị" });
        expect(search).toHaveAttribute("placeholder", "Nhập tên trang, ví dụ Đơn hàng hoặc Thanh toán…");
        expect(document.documentElement).toHaveAttribute("lang", "vi");
    });

    it("switches the admin interface to dark theme", async () => {
        vi.mocked(fetchAdminAlerts).mockResolvedValue({ alerts: [], unread: 0 });
        renderHeader();

        fireEvent.click(screen.getByRole("button", { name: "System theme" }));
        fireEvent.click(screen.getByRole("option", { name: "Dark mode" }));

        await waitFor(() => expect(document.documentElement).toHaveAttribute("data-theme", "dark"));
        expect(window.localStorage.getItem("digital-e:color-scheme:v1")).toBe(JSON.stringify("dark"));
        expect(screen.getByRole("button", { name: "Dark mode" })).toBeInTheDocument();
    });

    it("shows a retryable error instead of the empty copy on initial failure", async () => {
        vi.mocked(fetchAdminAlerts).mockRejectedValue({ response: { status: 500 } });
        renderHeader();
        fireEvent.click(screen.getByRole("button", { name: /^Notifications/ }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load admin data");
        expect(screen.queryByText("No new notifications right now.")).not.toBeInTheDocument();
    });

    it("shows the fulfilled empty copy", async () => {
        vi.mocked(fetchAdminAlerts).mockResolvedValue({ alerts: [], unread: 0 });
        renderHeader();
        fireEvent.click(screen.getByRole("button", { name: /^Notifications/ }));

        expect(await screen.findByText("No new notifications right now.")).toBeInTheDocument();
    });

    it("preserves prior activities alongside a retryable refresh error", async () => {
        vi.mocked(fetchAdminAlerts)
            .mockResolvedValueOnce({ alerts: [alert], unread: 1 })
            .mockRejectedValueOnce({ response: { status: 500 } });
        renderHeader();

        await waitFor(() => expect(fetchAdminAlerts).toHaveBeenCalledOnce());
        fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));
        fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

        expect(await screen.findByText("Order requires review")).toBeInTheDocument();
        expect(screen.getByRole("alert")).toHaveTextContent("Activity refresh failed");
        expect(screen.getByRole("button", { name: "Retry activity feed" })).toBeInTheDocument();
    });

    it("exposes activity actions as links and can mark the feed as read", async () => {
        vi.mocked(fetchAdminAlerts).mockResolvedValue({
            alerts: [
                alert,
                {
                    ...alert,
                    id: "inventory-1",
                    type: "inventory",
                    title: "Low stock",
                    description: "Review the product inventory.",
                    actionLabel: "Manage product",
                    route: "/admin/products",
                },
            ],
            unread: 2,
        });
        renderHeader();

        await waitFor(() => expect(screen.getByRole("button", { name: "Notifications, 2 unread" })).toBeInTheDocument());
        fireEvent.click(screen.getByRole("button", { name: "Notifications, 2 unread" }));

        expect(screen.getByRole("link", { name: "Order requires review: Review" })).toHaveAttribute(
            "href",
            "/admin/orders",
        );
        expect(screen.getByRole("link", { name: "Low stock: Manage product" })).toHaveAttribute(
            "href",
            "/admin/products",
        );

        fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));

        await waitFor(() => expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument());
        expect(screen.getByRole("button", { name: "Mark all as read" })).toBeDisabled();
        expect(acknowledgeAdminAlerts).toHaveBeenCalledWith(["alert-1", "inventory-1"]);
    });

    it("marks an activity as read when its internal link is opened", async () => {
        vi.mocked(fetchAdminAlerts).mockResolvedValue({ alerts: [alert], unread: 1 });
        renderHeader();

        await waitFor(() => expect(screen.getByRole("button", { name: "Notifications, 1 unread" })).toBeInTheDocument());
        fireEvent.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));
        fireEvent.click(screen.getByRole("link", { name: "Order requires review: Review" }));

        await waitFor(() => expect(acknowledgeAdminAlerts).toHaveBeenCalledWith(["alert-1"]));
    });

    it("counts unread alerts beyond the eight items shown in the popover", async () => {
        vi.mocked(fetchAdminAlerts).mockResolvedValue({
            alerts: Array.from({ length: 10 }, (_, index) => ({
                ...alert,
                id: `order-${index + 1}`,
                title: `Order ${index + 1} requires review`,
            })),
            unread: 10,
        });
        renderHeader();

        const trigger = await screen.findByRole("button", { name: "Notifications, 10 unread" });
        fireEvent.click(trigger);

        expect(screen.getAllByRole("link")).toHaveLength(8);
    });

    it("navigates to an exact Admin page match including payment reconciliation", async () => {
        vi.mocked(fetchAdminAlerts).mockResolvedValue({ alerts: [], unread: 0 });
        renderHeader();
        await waitFor(() => expect(fetchAdminAlerts).toHaveBeenCalledOnce());

        const search = screen.getByRole("combobox", { name: "Go to Admin page" });
        fireEvent.change(search, { target: { value: "payment" } });
        fireEvent.submit(search.closest("form")!);

        expect(mocks.navigate).toHaveBeenCalledWith("/admin/payments/reconciliation");
        expect(mocks.addToast).not.toHaveBeenCalled();
        expect(search).toHaveValue("");
    });

    it("does not navigate when the Admin page search has no match", async () => {
        vi.mocked(fetchAdminAlerts).mockResolvedValue({ alerts: [], unread: 0 });
        renderHeader();
        await waitFor(() => expect(fetchAdminAlerts).toHaveBeenCalledOnce());

        const search = screen.getByRole("combobox", { name: "Go to Admin page" });
        expect(search).toHaveAttribute("placeholder", "Type a page name, e.g. Orders or Payments…");

        fireEvent.change(search, { target: { value: "laptop" } });
        fireEvent.submit(search.closest("form")!);

        expect(mocks.navigate).not.toHaveBeenCalled();
        expect(mocks.addToast).toHaveBeenCalledWith(
            "Admin navigation",
            "Try a page name from the suggestions.",
        );
    });

    it("keeps logout confirmation inside the Admin profile dropdown", async () => {
        vi.mocked(fetchAdminAlerts).mockResolvedValue({ alerts: [], unread: 0 });
        renderHeader();
        await waitFor(() => expect(fetchAdminAlerts).toHaveBeenCalledOnce());

        const profile = screen.getByRole("button", { name: /^Admin profile/ });
        fireEvent.click(profile);

        expect(profile).toHaveAttribute("aria-expanded", "true");
        fireEvent.click(screen.getByRole("button", { name: "Log out" }));
        expect(await screen.findByText("Are you sure you want to logout?")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(screen.queryByText("Are you sure you want to logout?")).not.toBeInTheDocument();
    });

    it("closes the activity popover on Escape and returns focus to its trigger", async () => {
        vi.mocked(fetchAdminAlerts).mockResolvedValue({ alerts: [], unread: 0 });
        renderHeader();

        const trigger = screen.getByRole("button", { name: /^Notifications/ });
        fireEvent.click(trigger);
        expect(screen.getByRole("dialog", { name: "Activity feed" })).toHaveAttribute("id", "admin-notifications-popover");

        fireEvent.keyDown(document, { key: "Escape" });

        await waitFor(() => expect(screen.queryByRole("dialog", { name: "Activity feed" })).not.toBeInTheDocument());
        await waitFor(() => expect(trigger).toHaveFocus());
    });
});
