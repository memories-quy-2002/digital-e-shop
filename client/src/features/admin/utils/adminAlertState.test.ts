import { beforeEach, describe, expect, it } from "vitest";
import type { AdminAlert } from "../api";
import { applyAdminAlertReadState, getAdminAlertReadIds, saveAdminAlertReadIds } from "./adminAlertState";

const alert = (overrides: Partial<AdminAlert> = {}): AdminAlert => ({
    id: "order-1",
    type: "order",
    title: "Pending order",
    description: "Review the order",
    createdAt: "2026-09-09T00:00:00.000Z",
    priority: "High",
    actionLabel: "Open orders",
    route: "/admin/orders",
    unread: true,
    ...overrides,
});

describe("admin alert read state", () => {
    beforeEach(() => window.localStorage.clear());

    it("persists read ids and applies them without changing alert data", () => {
        saveAdminAlertReadIds("admin-1", ["order-1"]);

        expect(getAdminAlertReadIds("admin-1")).toEqual(["order-1"]);
        expect(applyAdminAlertReadState([alert(), alert({ id: "inventory-1", unread: false })], ["order-1"])).toEqual([
            { ...alert(), unread: false },
            { ...alert({ id: "inventory-1", unread: false }), unread: false },
        ]);
    });

    it("keeps read state isolated between admins", () => {
        saveAdminAlertReadIds("admin-1", ["order-1"]);

        expect(getAdminAlertReadIds("admin-2")).toEqual([]);
        expect(applyAdminAlertReadState([alert()], getAdminAlertReadIds("admin-2"))[0].unread).toBe(true);
    });
});
