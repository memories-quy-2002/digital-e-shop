import { beforeEach, describe, expect, it, vi } from "vitest";

const { withTransaction } = vi.hoisted(() => ({ withTransaction: vi.fn() }));
vi.mock("../../database/transaction", () => ({ withTransaction }));

import { FulfillmentService } from "../fulfillment.service";

describe("FulfillmentService historical shipment boundary", () => {
    beforeEach(() => vi.clearAllMocks());

    it("rejects mutations to historical GHN shipments", async () => {
        const tx = { query: vi.fn() };
        vi.mocked(withTransaction).mockImplementation(async (work) => work(tx as never));
        const repository = {
            lockOrder: vi.fn().mockResolvedValue({ id: 42, status: 0 }),
            ensureShipment: vi.fn().mockResolvedValue({ id: 17, provider: "GHN", state: "SHIPPED" }),
            event: vi.fn(),
            summary: vi.fn(),
        };
        const emails = { emit: vi.fn() };
        const service = new FulfillmentService(repository as never, emails as never);

        await expect(service.transition(42, "PICKING", "admin-1"))
            .rejects.toThrow("Historical shipments are read-only");
        expect(tx.query).not.toHaveBeenCalled();
        expect(repository.event).not.toHaveBeenCalled();
        expect(emails.emit).not.toHaveBeenCalled();
    });
});
