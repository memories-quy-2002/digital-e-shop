import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminHeader from "./AdminHeader";
import { fetchAdminAlerts } from "../../features/admin/api";
import { getAdminAlertReadIds } from "../../features/admin/utils/adminAlertState";

const mocks = vi.hoisted(() => ({
    addToast: vi.fn(),
    navigate: vi.fn(),
    axios: { post: vi.fn() },
}));

vi.mock("../../features/admin/api", () => ({ fetchAdminAlerts: vi.fn() }));
vi.mock("../../context/AuthContext", () => ({
    useAuth: () => ({ userData: { username: "admin", role: "Admin" }, loading: false }),
}));
vi.mock("../../context/ToastContext", () => ({ useToast: () => ({ addToast: mocks.addToast }) }));
vi.mock("../../api/axios", () => ({ default: mocks.axios }));
vi.mock("../../services/firebase", () => ({ signOutFirebaseUser: vi.fn() }));
vi.mock("react-router-dom", async () => ({
    ...(await vi.importActual<typeof import("react-router-dom")>("react-router-dom")),
    useNavigate: () => mocks.navigate,
}));

const renderHeader = () => render(
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
        mocks.axios.post.mockResolvedValue({ data: {} });
        window.localStorage.clear();
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

        expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Mark all as read" })).toBeDisabled();
        expect(getAdminAlertReadIds()).toEqual(["alert-1", "inventory-1"]);
    });

    it("marks an activity as read when its internal link is opened", async () => {
        vi.mocked(fetchAdminAlerts).mockResolvedValue({ alerts: [alert], unread: 1 });
        renderHeader();

        await waitFor(() => expect(screen.getByRole("button", { name: "Notifications, 1 unread" })).toBeInTheDocument());
        fireEvent.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));
        fireEvent.click(screen.getByRole("link", { name: "Order requires review: Review" }));

        expect(getAdminAlertReadIds()).toContain("alert-1");
    });

    it("communicates section navigation and clarifies unknown keywords", () => {
        renderHeader();

        const search = screen.getByRole("textbox", { name: "Jump to an Admin section" });
        expect(search).toHaveAttribute("placeholder", "Jump to Products, Orders, or Accounts…");

        fireEvent.change(search, { target: { value: "laptop" } });
        fireEvent.submit(search.closest("form")!);

        expect(mocks.navigate).toHaveBeenCalledWith("/admin");
        expect(mocks.addToast).toHaveBeenCalledWith(
            "Admin navigation",
            "Choose Products, Orders, or Accounts from the section search.",
        );
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
