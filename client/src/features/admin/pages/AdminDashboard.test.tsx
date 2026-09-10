// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminDashboard from "./AdminDashboard";
import {
    fetchAdminOrders,
    fetchAdminProducts,
    fetchAdminUsers,
    fetchAdminAlerts,
    fetchAnalyticsSummary,
    fetchOrderItems,
} from "../api";

const { addToast } = vi.hoisted(() => ({ addToast: vi.fn() }));

vi.mock("../api", () => ({
    fetchAnalyticsSummary: vi.fn(),
    fetchAdminProducts: vi.fn(),
    fetchAdminOrders: vi.fn(),
    fetchAdminUsers: vi.fn(),
    fetchAdminAlerts: vi.fn(),
    fetchOrderItems: vi.fn(),
}));
vi.mock("../../../components/layout/AdminLayout", () => ({
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("../../../context/ToastContext", () => ({ useToast: () => ({ addToast }) }));

const LocationProbe = () => {
    const location = useLocation();
    return <output data-testid="location">{location.pathname}{location.search}</output>;
};

const renderDashboard = (initialEntries = ["/admin" as string]) => render(
    <MemoryRouter initialEntries={initialEntries}>
        <AdminDashboard />
    </MemoryRouter>,
);

const renderDashboardWithLocation = (initialEntries = ["/admin" as string]) => render(
    <MemoryRouter initialEntries={initialEntries}>
        <AdminDashboard />
        <LocationProbe />
    </MemoryRouter>,
);

describe("AdminDashboard mixed request results", () => {
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(fetchAnalyticsSummary).mockRejectedValue({ response: { status: 401 } });
        vi.mocked(fetchAdminProducts).mockResolvedValue([
            { id: 1, name: "USB-C Hub", category: "Accessories", stock: 7 } as never,
        ]);
        vi.mocked(fetchAdminOrders).mockRejectedValue({ response: { status: 401 } });
        vi.mocked(fetchAdminUsers).mockRejectedValue({ response: { status: 401 } });
        vi.mocked(fetchOrderItems).mockRejectedValue({ response: { status: 401 } });
        vi.mocked(fetchAdminAlerts).mockResolvedValue({ alerts: [], unread: 0 });
    });

    it("keeps successful product data and labels rejected sections unavailable", async () => {
        renderDashboard();

        await waitFor(() => expect(screen.getByText(/Partially updated/)).toBeTruthy());

        expect(screen.getByText("No low-stock products")).toBeTruthy();
        const lazyChartQueryOptions = { timeout: 5000 };
        expect(await screen.findByText("Analytics unavailable", {}, lazyChartQueryOptions)).toBeTruthy();
        expect(await screen.findByText("Recent activity unavailable", {}, lazyChartQueryOptions)).toBeTruthy();
        expect(await screen.findByText("Category analytics unavailable", {}, lazyChartQueryOptions)).toBeTruthy();
        expect(await screen.findByText("Best-selling products unavailable", {}, lazyChartQueryOptions)).toBeTruthy();
        expect((await screen.findAllByText("Inventory risk")).length).toBeGreaterThan(0);
        expect(screen.getAllByRole("heading", { name: "Inventory risk" })).toHaveLength(1);
        expect(screen.queryByRole("heading", { name: "Live order activity" })).toBeNull();
        expect(screen.queryByRole("heading", { name: "Revenue trend" })).toBeNull();
        expect(screen.queryByText("Inventory risk unavailable")).toBeNull();
        expect(screen.queryByText("Updated now")).toBeNull();
        expect(screen.getAllByText("Unavailable").length).toBeGreaterThanOrEqual(3);
    }, 15000);

    it("marks preserved analytics KPIs unavailable after an analytics refresh failure", async () => {
        vi.mocked(fetchAnalyticsSummary)
            .mockResolvedValueOnce({
                summary: {
                    kpis: {
                        revenue: { net: 1234, comparison: { current: 1234, previous: 1000, deltaPercent: 23.4 } },
                        inventory: { totalProducts: 99 },
                        customers: { total: 77 },
                        orders: { total: 55, pending: 4, completed: 8, comparison: { current: 12, previous: 10, deltaPercent: 20 } },
                    },
                },
            })
            .mockRejectedValueOnce({ response: { status: 401 } });
        vi.mocked(fetchAdminProducts)
            .mockResolvedValueOnce([{ id: 1, name: "USB-C Hub", category: "Accessories", stock: 7 }] as never)
            .mockResolvedValueOnce([{ id: 1, name: "USB-C Hub", category: "Accessories", stock: 7 }] as never);
        vi.mocked(fetchAdminOrders).mockResolvedValue([].concat([]) as never);
        vi.mocked(fetchAdminUsers).mockResolvedValue([].concat([]) as never);
        vi.mocked(fetchOrderItems).mockResolvedValue([].concat([]) as never);

        renderDashboard();
        await waitFor(() => expect(screen.getByText(/Updated/)).toBeTruthy());
        expect(screen.getAllByText("$1,234.00").length).toBeGreaterThan(0);
        expect(screen.getAllByText("55").length).toBeGreaterThan(0);

        fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

        await waitFor(() => expect(screen.getByText(/Partially updated/)).toBeTruthy());
        expect(screen.queryAllByText("55")).toHaveLength(0);
        expect(screen.queryByText("$1,234.00")).toBeNull();
        expect(screen.getAllByText("Unavailable").length).toBeGreaterThan(0);
        expect(screen.getByText("Analytics unavailable")).toBeTruthy();

        const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:refresh-report");
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
        fireEvent.click(screen.getByRole("button", { name: "Download report" }));
        const report = await (createObjectURL.mock.calls[0][0] as Blob).text();
        expect(report).toContain("- Active products: Unavailable");
        expect(report).toContain("- Registered users: Unavailable");
        expect(report).toContain("- Orders tracked: Unavailable");
        expect(report).toContain("- Orders (Last 30 days): Unavailable");
    });

    it("gates analytics KPI values and report fields by each rejected source", async () => {
        vi.mocked(fetchAnalyticsSummary).mockResolvedValue({
            summary: {
                kpis: {
                    inventory: { totalProducts: 99 },
                    customers: { total: 77 },
                    orders: { total: 55 },
                },
                operations: { inventoryRisk: [{ name: "Preserved GPU", stock: 2 }] },
            },
        });
        vi.mocked(fetchAdminProducts).mockRejectedValue({ response: { status: 401 } });
        vi.mocked(fetchAdminUsers).mockRejectedValue({ response: { status: 401 } });
        vi.mocked(fetchAdminOrders).mockRejectedValue({ response: { status: 401 } });
        vi.mocked(fetchOrderItems).mockRejectedValue({ response: { status: 401 } });

        renderDashboard();

        await waitFor(() => expect(screen.getByText(/Partially updated/)).toBeTruthy());

        expect(screen.getByText("Orders needing action unavailable")).toBeTruthy();
        expect(screen.getAllByText("Inventory risk unavailable").length).toBeGreaterThan(0);

        const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:dashboard-report");
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
        fireEvent.click(screen.getByRole("button", { name: "Download report" }));

        const reportBlob = createObjectURL.mock.calls[0][0] as Blob;
        const report = await reportBlob.text();
        expect(report).toContain("- Orders tracked: Unavailable");
        expect(report).toContain("- Active products: Unavailable");
        expect(report).toContain("- Registered users: Unavailable");
        expect(report).toContain("- Orders (Last 30 days): 0");
        expect(report).toContain("- Revenue (Last 30 days): $0.00");
        expect(report).toContain("- Bank transfer orders: Unavailable");
        expect(report).toContain("- Cash orders: Unavailable");
        expect(report).toContain("TOP REVENUE PRODUCTS\n- Unavailable");
        expect(report).toContain("LOW STOCK WATCHLIST\n- Unavailable");
        expect(report).toContain("LATEST ORDERS\n- Unavailable");
        expect(report).toContain("NEWEST CUSTOMERS\n- Unavailable");
    });

    it("retains valid data in a fully successful report", async () => {
        const today = new Date().toISOString();
        vi.mocked(fetchAnalyticsSummary).mockResolvedValue({
            summary: {
                kpis: {
                    inventory: { totalProducts: 1 },
                    customers: { total: 1 },
                    orders: { total: 1, pending: 1 },
                },
                operations: { inventoryRisk: [] },
            },
        });
        vi.mocked(fetchAdminProducts).mockResolvedValue([
            { id: 1, name: "USB-C Hub", category: "Accessories", stock: 2 },
        ] as never);
        vi.mocked(fetchAdminOrders).mockResolvedValue([
            { id: 42, status: 0, total_price: 19.99, discount: 0, date_added: today, payment_method: "cash" },
        ] as never);
        vi.mocked(fetchAdminUsers).mockResolvedValue([
            { id: "u1", email: "buyer@example.com", username: "buyer", first_name: "Ada", last_name: "Lovelace", role: "customer", created_at: today },
        ] as never);
        vi.mocked(fetchOrderItems).mockResolvedValue([
            { id: 1, order_id: 42, name: "USB-C Hub", sales: 1, revenue: 19.99, price: 19.99 },
        ] as never);

        renderDashboard();
        await waitFor(() => expect(screen.getByText(/Updated/)).toBeTruthy());

        const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:success-report");
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
        fireEvent.click(screen.getByRole("button", { name: "Download report" }));
        const report = await (createObjectURL.mock.calls[0][0] as Blob).text();

        expect(report).toContain("1. USB-C Hub | Sales: 1 | Revenue: $19.99");
        expect(report).toContain("1. USB-C Hub | Remaining stock: 2");
        expect(report).toContain("- Order #42");
        expect(report).toContain("Ada Lovelace | buyer@example.com");
    });

    it("loads the selected analytics range from the URL and updates it in place", async () => {
        vi.mocked(fetchAnalyticsSummary).mockResolvedValue({ summary: { kpis: {} } });

        renderDashboardWithLocation(["/admin?range=7d"]);

        expect(screen.getByLabelText("Analytics range")).toHaveValue("7d");
        fireEvent.change(screen.getByLabelText("Analytics range"), { target: { value: "90d" } });

        await waitFor(() => expect(fetchAnalyticsSummary).toHaveBeenCalledWith("90d"));
        expect(screen.getByTestId("location")).toHaveTextContent("/admin?range=90d");
    });

    it("keeps analytics visible and makes the alert feed retryable when alerts fail", async () => {
        vi.mocked(fetchAnalyticsSummary).mockResolvedValue({
            summary: {
                kpis: {
                    revenue: { comparison: { current: 240, previous: 200, deltaPercent: 20 } },
                    orders: { total: 8, comparison: { current: 3, previous: 2, deltaPercent: 50 } },
                    inventory: { lowStock: 1 },
                },
            },
        });
        vi.mocked(fetchAdminAlerts).mockRejectedValue({ response: { status: 500 } });

        renderDashboard();

        expect(await screen.findByText("Needs attention is unavailable")).toBeTruthy();
        expect(screen.getByText("Net revenue")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Retry alerts" })).toBeTruthy();
        expect(screen.getByText("Partially updated")).toBeTruthy();
    });

});
