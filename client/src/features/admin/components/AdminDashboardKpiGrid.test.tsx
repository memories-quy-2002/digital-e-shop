import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AdminDashboardKpiGrid, { type AdminDashboardKpi } from "./AdminDashboardKpiGrid";

const kpis: AdminDashboardKpi[] = [
    { label: "Net revenue", value: "$12,400", description: "Selected period", status: "success" },
    { label: "Orders", value: 84, description: "All order statuses", status: "success" },
    { label: "Pending orders", value: 6, description: "Awaiting action", status: "success" },
    { label: "Low stock", value: 4, description: "At or below threshold", status: "success" },
];

describe("AdminDashboardKpiGrid", () => {
    it("renders exactly four primary KPI articles", () => {
        render(<AdminDashboardKpiGrid kpis={kpis} />);

        expect(screen.getAllByRole("article")).toHaveLength(4);
        expect(screen.queryByText("Top product")).toBeNull();
    });

    it("keeps failed metrics truthful", () => {
        render(<AdminDashboardKpiGrid kpis={kpis.map((kpi) => ({ ...kpi, status: kpi.label === "Orders" ? "error" : kpi.status }))} />);

        expect(screen.getByText("Unavailable")).toBeTruthy();
    });
});
