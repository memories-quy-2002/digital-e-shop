import { describe, expect, it, vi } from "vitest";

const { withTransaction } = vi.hoisted(() => ({ withTransaction: vi.fn() }));
vi.mock("../../database/transaction", () => ({ withTransaction }));

import { TasksRepository } from "../tasks.repository";

describe("TasksRepository retired carrier task boundary", () => {
    it.each(["SHIPMENT_CREATE", "SHIPMENT_SYNC"] as const)("rejects new %s work before persistence", async (kind) => {
        const tx = { query: vi.fn() };
        const repository = new TasksRepository();

        await expect(repository.enqueue(tx as never, { kind, key: "legacy-carrier-task", payload: { orderId: 42 } }))
            .rejects.toThrow("Shipping tasks are retired");
        expect(tx.query).not.toHaveBeenCalled();
    });

    it.each(["SHIPMENT_CREATE", "SHIPMENT_SYNC"] as const)("marks an already queued %s as failed without leasing it", async (kind) => {
        const now = new Date("2026-10-16T12:00:00.000Z");
        const tx = { query: vi.fn().mockResolvedValue([{ id: 51, kind, business_key: "legacy:51", payload: "{}", attempt: 0, first_attempt_at: null }]) };
        vi.mocked(withTransaction).mockImplementation(async (work) => work(tx as never));
        const repository = new TasksRepository();

        await expect(repository.claimDue(10, now)).resolves.toEqual([]);

        const failureUpdate = String(tx.query.mock.calls[1][0]);
        expect(failureUpdate).toContain("state = 'FAILED'");
        expect(failureUpdate).toContain("shipping_provider_retired");
        expect(failureUpdate).toContain("updated_at = ?");
        expect(tx.query.mock.calls[1][1]).toEqual([now, 51]);
    });
});
