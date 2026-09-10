import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminNotificationsPage from "./AdminNotificationsPage";
import { fetchAdminAlerts } from "../api";

vi.mock("../api", () => ({ fetchAdminAlerts: vi.fn() }));
vi.mock("../../../components/layout/AdminLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../../../context/ToastContext", () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock("react-router-dom", async () => ({
    ...(await vi.importActual<typeof import("react-router-dom")>("react-router-dom")),
    useNavigate: () => vi.fn(),
}));

describe("AdminNotificationsPage request states", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
    });

    it("shows a retryable error instead of the empty state when loading fails", async () => {
        vi.mocked(fetchAdminAlerts).mockRejectedValue({ response: { status: 500 } });
        render(<AdminNotificationsPage />);

        expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load admin data");
        expect(screen.queryByText("No matching notifications")).not.toBeInTheDocument();
    });

    it("keeps the fulfilled empty state", async () => {
        vi.mocked(fetchAdminAlerts).mockResolvedValue({ alerts: [], unread: 0 });
        render(<AdminNotificationsPage />);

        await waitFor(() => expect(screen.getByText("No matching notifications")).toBeInTheDocument());
    });

    it("marks one notification and then the remaining notifications as read", async () => {
        vi.mocked(fetchAdminAlerts).mockResolvedValue({
            alerts: [
                {
                    id: "order-1",
                    type: "order",
                    title: "Pending order",
                    description: "Review the pending order",
                    createdAt: "2026-09-09T00:00:00.000Z",
                    priority: "High",
                    actionLabel: "Open orders",
                    route: "/admin/orders",
                    unread: true,
                },
                {
                    id: "inventory-1",
                    type: "inventory",
                    title: "Low stock",
                    description: "Review inventory",
                    createdAt: "2026-09-09T00:00:00.000Z",
                    priority: "Medium",
                    actionLabel: "Manage product",
                    route: "/admin/products",
                    unread: true,
                },
            ],
            unread: 2,
        });
        render(<AdminNotificationsPage />);

        await waitFor(() => expect(screen.getByText("2 visible alerts · 2 unread")).toBeInTheDocument());
        fireEvent.click(screen.getByRole("button", { name: "Mark Pending order as read" }));
        expect(screen.getByText("2 visible alerts · 1 unread")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
        expect(screen.getByText("2 visible alerts · 0 unread")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Pending order is read" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Low stock is read" })).toBeDisabled();
    });
});
