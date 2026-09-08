// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminDashboard from "./AdminDashboard";
import {
    fetchAdminOrders,
    fetchAdminProducts,
    fetchAdminUsers,
    fetchAnalyticsSummary,
    fetchOrderItems,
} from "../api";

const { addToast } = vi.hoisted(() => ({ addToast: vi.fn() }));

vi.mock("../api", () => ({
    fetchAnalyticsSummary: vi.fn(),
    fetchAdminProducts: vi.fn(),
    fetchAdminOrders: vi.fn(),
    fetchAdminUsers: vi.fn(),
    fetchOrderItems: vi.fn(),
}));
vi.mock("../../../components/layout/AdminLayout", () => ({
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("../../../context/ToastContext", () => ({ useToast: () => ({ addToast }) }));

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
    });

    it("keeps successful product data and labels rejected sections unavailable", async () => {
        render(<AdminDashboard />);

        await waitFor(() => expect(screen.getByText(/Partially updated/)).toBeTruthy());

        expect(screen.getAllByText("1").length).toBeGreaterThan(0);
        expect(await screen.findByText("Analytics unavailable")).toBeTruthy();
        expect(await screen.findByText("Order activity unavailable")).toBeTruthy();
        expect(await screen.findByText("Recent activity unavailable")).toBeTruthy();
        expect(await screen.findByText("Category analytics unavailable")).toBeTruthy();
        expect(await screen.findByText("Best-selling products unavailable")).toBeTruthy();
        expect(await screen.findByText("Inventory risk")).toBeTruthy();
        expect(screen.queryByText("Inventory risk unavailable")).toBeNull();
        expect(screen.queryByText("Updated now")).toBeNull();
        expect(screen.getAllByText("Unavailable").length).toBeGreaterThanOrEqual(4);
    });

    it("marks preserved analytics KPIs unavailable after an analytics refresh failure", async () => {
        vi.mocked(fetchAnalyticsSummary)
            .mockResolvedValueOnce({
                summary: {
                    kpis: {
                        revenue: { net: 1234 },
                        inventory: { totalProducts: 99 },
                        customers: { total: 77 },
                        orders: { total: 55, pending: 4, completed: 8 },
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

        render(<AdminDashboard />);
        await waitFor(() => expect(screen.getByText(/Updated/)).toBeTruthy());
        expect(screen.getAllByText("99").length).toBeGreaterThan(0);
        expect(screen.getAllByText("77").length).toBeGreaterThan(0);
        expect(screen.getAllByText("55").length).toBeGreaterThan(0);

        fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

        await waitFor(() => expect(screen.getByText(/Partially updated/)).toBeTruthy());
        expect(screen.queryAllByText("99")).toHaveLength(0);
        expect(screen.queryAllByText("77")).toHaveLength(0);
        expect(screen.queryAllByText("55")).toHaveLength(0);
        expect(screen.getAllByText("Unavailable").length).toBeGreaterThanOrEqual(4);
        expect(screen.getByText("Analytics unavailable")).toBeTruthy();

        const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:refresh-report");
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
        fireEvent.click(screen.getByRole("button", { name: "Download Detailed Report" }));
        const report = await (createObjectURL.mock.calls[0][0] as Blob).text();
        expect(report).toContain("- Active products: Unavailable");
        expect(report).toContain("- Registered users: Unavailable");
        expect(report).toContain("- Orders tracked: Unavailable");
        expect(report).toContain("- Sales this month: Unavailable");
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

        render(<AdminDashboard />);

        await waitFor(() => expect(screen.getByText(/Partially updated/)).toBeTruthy());

        expect(screen.getByText("Active listings").closest(".admin__dashboard__summary-card")?.querySelector("strong")?.textContent).toBe("Unavailable");
        expect(screen.getByText("Registered accounts").closest(".admin__dashboard__summary-card")?.querySelector("strong")?.textContent).toBe("Unavailable");
        expect(screen.getByText("All recorded orders").closest(".admin__dashboard__summary-card")?.querySelector("strong")?.textContent).toBe("Unavailable");
        expect(screen.getAllByText("Unavailable").length).toBeGreaterThanOrEqual(5);

        const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:dashboard-report");
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
        fireEvent.click(screen.getByRole("button", { name: "Download Detailed Report" }));

        const reportBlob = createObjectURL.mock.calls[0][0] as Blob;
        const report = await reportBlob.text();
        expect(report).toContain("- Orders tracked: Unavailable");
        expect(report).toContain("- Active products: Unavailable");
        expect(report).toContain("- Registered users: Unavailable");
        expect(report).toContain("- Sales this month: Unavailable");
        expect(report).toContain("- Revenue this month: Unavailable");
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

        render(<AdminDashboard />);
        await waitFor(() => expect(screen.getByText(/Updated/)).toBeTruthy());

        const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:success-report");
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
        fireEvent.click(screen.getByRole("button", { name: "Download Detailed Report" }));
        const report = await (createObjectURL.mock.calls[0][0] as Blob).text();

        expect(report).toContain("1. USB-C Hub | Sales: 1 | Revenue: $19.99");
        expect(report).toContain("1. USB-C Hub | Remaining stock: 2");
        expect(report).toContain("- Order #42");
        expect(report).toContain("Ada Lovelace | buyer@example.com");
    });

});
