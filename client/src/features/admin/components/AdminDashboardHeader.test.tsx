import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AdminDashboardHeader from "./AdminDashboardHeader";

const props = {
    range: "30d" as const,
    onRangeChange: vi.fn(),
    loading: false,
    updateLabel: "Updated" as const,
    lastUpdated: "10:30 UTC",
    onRefresh: vi.fn(),
    onDownloadReport: vi.fn(),
};

describe("AdminDashboardHeader", () => {
    it("renders a labelled range selector and both actions", () => {
        render(<AdminDashboardHeader {...props} />);

        expect(screen.getByLabelText("Analytics range")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Download report" })).toBeTruthy();
    });

    it("disables refresh while the dashboard is loading", () => {
        render(<AdminDashboardHeader {...props} loading />);

        expect(screen.getByRole("button", { name: "Refreshing…" })).toBeDisabled();
    });
});
