import { describe, expect, it, vi } from "vitest";
import { AdminAuditService } from "./admin-audit.service";

describe("AdminAuditService", () => {
    it("clamps pages past the end before querying the event page", async () => {
        const repository = {
            getCount: vi.fn().mockResolvedValue(27),
            getPage: vi.fn().mockResolvedValue([]),
        };
        const service = new AdminAuditService(repository as never);

        const result = await service.getEvents(999, 10, { search: "", entityType: undefined });

        expect(repository.getPage).toHaveBeenCalledWith(10, 20, { search: "", entityType: undefined });
        expect(result.pagination).toEqual({ page: 3, limit: 10, total: 27, totalPages: 3 });
    });

    it("returns the first empty page when no events match", async () => {
        const repository = {
            getCount: vi.fn().mockResolvedValue(0),
            getPage: vi.fn().mockResolvedValue([]),
        };
        const service = new AdminAuditService(repository as never);

        const result = await service.getEvents(1_000_000, 25, { search: "", entityType: undefined });

        expect(repository.getPage).toHaveBeenCalledWith(25, 0, { search: "", entityType: undefined });
        expect(result.pagination).toEqual({ page: 1, limit: 25, total: 0, totalPages: 0 });
    });
});
