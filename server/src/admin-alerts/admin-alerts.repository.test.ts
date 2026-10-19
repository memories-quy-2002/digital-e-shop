import { ConflictException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("#src/config/database.config", () => ({ default: { query: vi.fn() } }));
vi.mock("../database/transaction", () => ({
    withTransaction: (work: (tx: { query: typeof mocks.query }) => Promise<unknown>) => work({ query: mocks.query }),
}));

import { AdminAlertsRepository } from "./admin-alerts.repository";

describe("AdminAlertsRepository alert claims", () => {
    const repository = new AdminAlertsRepository();

    beforeEach(() => mocks.query.mockReset());

    it("creates a row, locks it, and claims an unassigned alert for the current administrator", async () => {
        mocks.query.mockResolvedValue([]);

        await expect(repository.updateTriage("order-42", "admin-1", "claim")).resolves.toEqual({
            triageStatus: "OPEN",
            assignedAdminId: "admin-1",
            assignedToMe: true,
        });
        expect(mocks.query).toHaveBeenNthCalledWith(1, expect.stringContaining("INSERT IGNORE"), ["order-42", "admin-1"]);
        expect(mocks.query).toHaveBeenNthCalledWith(2, expect.stringContaining("FOR UPDATE"), ["order-42"]);
        expect(mocks.query).toHaveBeenNthCalledWith(3, expect.stringContaining("UPDATE admin_alert_triage"), ["admin-1", "admin-1", "order-42"]);
    });

    it("prevents a second administrator from taking an existing claim", async () => {
        mocks.query.mockResolvedValue([{ status: "OPEN", assigned_admin_id: "admin-2" }]);

        await expect(repository.updateTriage("order-42", "admin-1", "claim")).rejects.toBeInstanceOf(ConflictException);
        expect(mocks.query).toHaveBeenCalledTimes(2);
    });

    it("requires the assigned administrator to resolve an alert", async () => {
        mocks.query.mockResolvedValue([{ status: "OPEN", assigned_admin_id: "admin-2" }]);

        await expect(repository.updateTriage("order-42", "admin-1", "resolve")).rejects.toBeInstanceOf(ConflictException);
        expect(mocks.query).toHaveBeenCalledOnce();
    });
});
