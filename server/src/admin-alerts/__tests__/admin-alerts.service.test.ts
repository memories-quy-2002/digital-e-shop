import { describe, expect, it, vi } from "vitest";
import { AdminAlertsService } from "../admin-alerts.service";

describe("AdminAlertsService", () => {
    it("returns live alerts from the repository", async () => {
        const repository = { getAlerts: vi.fn().mockResolvedValue([{ type: "support", priority: "High" }]) };
        const service = new AdminAlertsService(repository as never);

        await expect(service.getAlerts()).resolves.toMatchObject([{ type: "support" }]);
    });
});
