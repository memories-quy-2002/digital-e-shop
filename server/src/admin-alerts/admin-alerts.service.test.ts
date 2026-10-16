import { NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminAlertsService } from "./admin-alerts.service";
import type { AdminAlertsRepository } from "./admin-alerts.repository";

describe("AdminAlertsService triage", () => {
    const repository = {
        getAlerts: vi.fn(),
        updateTriage: vi.fn(),
        acknowledgeAlerts: vi.fn(),
    };
    const service = new AdminAlertsService(repository as unknown as AdminAlertsRepository);

    beforeEach(() => vi.resetAllMocks());

    it("only updates triage while the alert is still active", async () => {
        repository.getAlerts.mockResolvedValue([{ id: "order-42" }]);
        repository.updateTriage.mockResolvedValue({ triageStatus: "OPEN", assignedAdminId: "admin-1", assignedToMe: true });

        await expect(service.updateTriage("admin-1", "order-42", "claim")).resolves.toMatchObject({ assignedToMe: true });
        expect(repository.updateTriage).toHaveBeenCalledWith("order-42", "admin-1", "claim");
    });

    it("rejects stale alert IDs without persisting state", async () => {
        repository.getAlerts.mockResolvedValue([]);

        await expect(service.updateTriage("admin-1", "inventory-42-20261016120000000000", "claim"))
            .rejects.toBeInstanceOf(NotFoundException);
        expect(repository.updateTriage).not.toHaveBeenCalled();
    });
});
