import { fireEvent, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithLocale } from "../../../test-utils/renderWithLocale";
import { fetchAdminAlerts, type AdminAlert } from "../api";
import AdminNotificationsPage from "./AdminNotificationsPage";

vi.mock("../api", () => ({
    acknowledgeAdminAlerts: vi.fn(),
    fetchAdminAlerts: vi.fn(),
    updateAdminAlertTriage: vi.fn(),
}));
vi.mock("../../../context/ToastContext", () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock("../../../components/layout/AdminLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

const alerts: AdminAlert[] = Array.from({ length: 12 }, (_, index) => ({
    id: `order-${index + 1}`,
    type: "order",
    title: index === 11 ? "Target alert" : `Order alert ${index + 1}`,
    description: "Pending order requires review.",
    createdAt: "2026-10-18T08:00:00.000Z",
    priority: "High",
    actionLabel: "Open orders",
    route: "/admin/orders",
    unread: true,
}));

const renderPage = () => renderWithLocale(<MemoryRouter><AdminNotificationsPage /></MemoryRouter>);

describe("AdminNotificationsPage pagination", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.removeItem("digital-e:locale:v1");
        vi.mocked(fetchAdminAlerts).mockResolvedValue({ alerts, unread: alerts.length });
    });

    it("shows ten alerts at a time and navigates between pages", async () => {
        renderPage();

        expect(await screen.findByText("Order alert 1")).toBeInTheDocument();
        expect(screen.getByText("Order alert 10")).toBeInTheDocument();
        expect(screen.queryByText("Order alert 11")).not.toBeInTheDocument();
        expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Next" }));

        expect(await screen.findByText("Target alert")).toBeInTheDocument();
        expect(screen.getByText("Order alert 11")).toBeInTheDocument();
        expect(screen.queryByText("Order alert 1")).not.toBeInTheDocument();
        expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    });

    it("returns to the first page when a search narrows the queue", async () => {
        renderPage();
        expect(await screen.findByText("Order alert 1")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Next" }));
        expect(await screen.findByText("Target alert")).toBeInTheDocument();

        fireEvent.change(screen.getByRole("searchbox", { name: "Search notifications" }), { target: { value: "Order alert 1" } });

        expect(await screen.findByText("Order alert 1")).toBeInTheDocument();
        expect(screen.queryByText("Target alert")).not.toBeInTheDocument();
    });

    it("localizes the pagination controls in Vietnamese", async () => {
        window.localStorage.setItem("digital-e:locale:v1", JSON.stringify("vi"));
        renderPage();

        expect(await screen.findByRole("navigation", { name: "Phân trang hàng đợi thông báo" })).toBeInTheDocument();
        expect(screen.getByText("Trang 1 trên 2")).toBeInTheDocument();
        expect(screen.getByText("Đang hiển thị 1–10 trên tổng 12 cảnh báo")).toBeInTheDocument();
    });
});
