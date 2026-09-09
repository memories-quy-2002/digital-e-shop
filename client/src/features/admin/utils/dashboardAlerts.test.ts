import { describe, expect, it } from "vitest";
import { groupAdminAlerts } from "./dashboardAlerts";
import type { AdminAlert } from "../api";

const createAlert = (overrides: Partial<AdminAlert> = {}): AdminAlert => ({
    id: "alert-1",
    type: "order",
    title: "Pending order",
    description: "Order needs review",
    createdAt: "2026-09-09T09:00:00.000Z",
    priority: "Medium",
    actionLabel: "Open orders",
    route: "/admin/orders",
    unread: true,
    ...overrides,
});

describe("dashboard alert grouping", () => {
    it("orders high priority groups before medium priority groups and groups by type", () => {
        const groups = groupAdminAlerts([
            createAlert({ id: "order-older", createdAt: "2026-09-08T09:00:00.000Z" }),
            createAlert({ id: "order-newer", createdAt: "2026-09-09T10:00:00.000Z", priority: "Low" }),
            createAlert({
                id: "payment-1",
                type: "payment",
                title: "Payment review",
                priority: "High",
                actionLabel: "Review payments",
                route: "/admin/orders",
            }),
            createAlert({
                id: "inventory-1",
                type: "inventory",
                title: "Low stock",
                priority: "Medium",
                createdAt: "2026-09-07T09:00:00.000Z",
                actionLabel: "Open products",
                route: "/admin/products",
            }),
        ]);

        expect(groups[0]).toMatchObject({ type: "payment", priority: "High" });
        expect(groups[1]).toMatchObject({ type: "order", count: 2 });
    });

    it("returns at most four groups and handles an empty response", () => {
        const types: AdminAlert["type"][] = ["order", "payment", "inventory", "support", "customer"];
        const alerts = types.map((type, index) => createAlert({
            id: `${type}-${index}`,
            type,
            priority: "Low",
        }));

        expect(groupAdminAlerts(alerts)).toHaveLength(4);
        expect(groupAdminAlerts([])).toEqual([]);
    });
});
