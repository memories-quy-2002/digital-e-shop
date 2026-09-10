import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AdminDashboardAttention from "./AdminDashboardAttention";

describe("AdminDashboardAttention", () => {
    it("renders an empty attention state after a successful empty response", () => {
        render(
            <MemoryRouter>
                <AdminDashboardAttention status="success" groups={[]} onRetry={vi.fn()} />
            </MemoryRouter>,
        );

        expect(screen.getByText("No active operational alerts")).toBeTruthy();
    });

    it("renders visible priority text and an action for grouped alerts", () => {
        render(
            <MemoryRouter>
                <AdminDashboardAttention
                    status="success"
                    groups={[{
                        type: "order",
                        count: 2,
                        priority: "High",
                        title: "Pending orders",
                        description: "Two orders need review.",
                        actionLabel: "Open orders",
                        route: "/admin/orders",
                    }]}
                    onRetry={vi.fn()}
                />
            </MemoryRouter>,
        );

        expect(screen.getByText("High priority")).toBeTruthy();
        expect(screen.getByRole("link", { name: "Open orders" })).toHaveAttribute("href", "/admin/orders");
    });
});
