import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { TasksRepository } from "../tasks.repository";
import { withTransaction } from "../../database/transaction";
import { closeIntegrationPools, integrationPool } from "../../database/__tests__/integration-database";

describe("operations task database integration", () => {
    const repository = new TasksRepository();
    const prefix = `task-test-${randomUUID()}`;
    const payload = { orderId: 42 };
    const enqueue = (suffix: string) => withTransaction((tx) => repository.enqueue(tx, { kind: "SHIPMENT_CREATE", key: prefix + suffix, payload }));
    beforeAll(() => {
        if (!['127.0.0.1', 'localhost'].includes(process.env.DB_HOST || '') || !/retail_p0_test/.test(process.env.DB_NAME || '')) {
            throw new Error("Task integration requires explicit local disposable retail_p0_test database");
        }
    });
    afterAll(async () => {
        await integrationPool.execute("DELETE FROM operations_tasks WHERE business_key LIKE ?", [prefix + '%']);
        await closeIntegrationPools();
    });
    it("integration rolls back enqueue with the business transaction", async () => {
        await expect(withTransaction(async (tx) => {
            await repository.enqueue(tx, { kind: "SHIPMENT_CREATE", key: prefix + '-rollback', payload });
            throw new Error("business rollback");
        })).rejects.toThrow("business rollback");
        const [rows] = await integrationPool.query("SELECT id FROM operations_tasks WHERE business_key = ?", [prefix + '-rollback']);
        expect(rows).toEqual([]);
    });
    it("integration deduplicates concurrent enqueue and rejects different facts", async () => {
        const ids = await Promise.all([enqueue('-same'), enqueue('-same')]);
        expect(ids[0]).toBe(ids[1]);
        await expect(withTransaction((tx) => repository.enqueue(tx, { kind: "SHIPMENT_CREATE", key: prefix + '-same', payload: { orderId: 43 } }))).rejects.toThrow("different facts");
        await integrationPool.execute("DELETE FROM operations_tasks WHERE id = ?", [ids[0]]);
    });
    it("integration gives one concurrent claimant each task and fences an expired worker", async () => {
        const id = await enqueue('-claim');
        const now = new Date(Date.now() + 1000);
        const batches = await Promise.all([repository.claimDue(1, now), repository.claimDue(1, now)]);
        const leases = batches.flat();
        expect(leases).toHaveLength(1);
        expect(leases[0].id).toBe(id);
        expect(await repository.finish(leases[0], { kind: "success" }, new Date(now.getTime() + 60001))).toBe(false);
        const [reclaimed] = await repository.claimDue(1, new Date(now.getTime() + 60001));
        expect(reclaimed.attempt).toBe(2);
        expect(reclaimed.token).not.toBe(leases[0].token);
        expect(await repository.finish(leases[0], { kind: "success" }, now)).toBe(false);
        expect(await repository.finish(reclaimed, { kind: "success", providerReference: "fixture" }, new Date(now.getTime() + 60002))).toBe(true);
    });
    it("integration obeys batch bounds and retries only when due", async () => {
        await enqueue('-bounds-a');
        await enqueue('-bounds-b');
        const now = new Date(Date.now() + 2000);
        const first = await repository.claimDue(1, now);
        expect(first).toHaveLength(1);
        await repository.finish(first[0], { kind: "retryable", reason: "timeout" }, now);
        const second = await repository.claimDue(100, now);
        expect(second).toHaveLength(1);
        await repository.finish(second[0], { kind: "success" }, now);
        expect(await repository.claimDue(20, new Date(now.getTime() + 29999))).toEqual([]);
        expect(await repository.claimDue(20, new Date(now.getTime() + 30000))).toHaveLength(1);
        expect(() => repository.claimDue(101)).toThrow();
    });
});
