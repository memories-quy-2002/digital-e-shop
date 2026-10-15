import { describe, expect, it, vi } from "vitest";
import { hashTaskPayload, boundBatch, nextTaskOutcome } from "../tasks.policy";
import { TasksRepository } from "../tasks.repository";
import { withTransaction } from "../../database/transaction";

vi.mock("../../database/transaction", () => ({ withTransaction: vi.fn() }));

describe("durable task policy", () => {
    it("hashes semantic object payloads independently of property insertion order", () => {
        expect(hashTaskPayload({ a: 1, b: { c: 2 } })).toBe(hashTaskPayload({ b: { c: 2 }, a: 1 }));
        expect(hashTaskPayload({ a: 2 })).not.toBe(hashTaskPayload({ a: 1 }));
    });
    it.each([0, -1, 1.5, 101, NaN])("rejects invalid batch %s", (limit) => {
        expect(() => boundBatch(limit)).toThrow();
    });
    it("uses bounded retry backoff and stops exhausted or ambiguous work", () => {
        const now = new Date("2026-10-14T00:00:00Z");
        expect(nextTaskOutcome(1, { kind: "retryable", reason: "timeout" }, now)).toEqual({
            state: "READY", dueAt: new Date("2026-10-14T00:00:30Z"), reason: "timeout", providerReference: null,
        });
        expect(nextTaskOutcome(8, { kind: "retryable", reason: "timeout" }, now).state).toBe("FAILED");
        expect(nextTaskOutcome(1, { kind: "ambiguous", reason: "unknown" }, now).state).toBe("REVIEW_REQUIRED");
        expect(nextTaskOutcome(1, { kind: "success", providerReference: "external-1" }, now).state).toBe("SUCCEEDED");
    });
    it("uses the PayOS retry schedule, honors provider retry hints, and reviews permanent mismatches", () => {
        const now = new Date("2026-10-14T00:00:00Z");
        const expected = [15000, 30000, 60000, 120000, 240000, 300000];
        expected.forEach((delay, index) => {
            const result = nextTaskOutcome(index + 1, { kind: "retryable", reason: "provider_busy" }, now, "PAYOS_RECONCILE");
            expect(result.state).toBe("READY");
            expect(result.dueAt.getTime() - now.getTime()).toBeGreaterThanOrEqual(delay);
            expect(result.dueAt.getTime() - now.getTime()).toBeLessThanOrEqual(delay + 3000);
        });
        const hinted = nextTaskOutcome(1, { kind: "retryable", reason: "retry_after", retryAfterMs: 45000 }, now, "PAYOS_RECONCILE");
        expect(hinted.dueAt.getTime() - now.getTime()).toBeGreaterThanOrEqual(45000);
        expect(nextTaskOutcome(8, { kind: "retryable", reason: "exhausted" }, now, "PAYOS_RECONCILE").state).toBe("REVIEW_REQUIRED");
        expect(nextTaskOutcome(1, { kind: "permanent", reason: "mismatch" }, now, "PAYOS_RECONCILE").state).toBe("REVIEW_REQUIRED");
    });
    it("rejects unsafe payloads instead of silently changing immutable facts", () => {
        expect(() => hashTaskPayload({ x: Infinity })).toThrow();
        expect(() => hashTaskPayload({ x: undefined })).toThrow();
    });
});

describe("task continuation fencing", () => {
    it("schedules cancellation after an active PayOS lookup to avoid concurrent provider calls", async () => {
        const now = new Date("2026-10-14T00:00:00Z");
        const tx = { query: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([
            { state: "READY", due_at: new Date(now.getTime() + 20_000), lease_expires_at: null },
        ]) };
        const repository = new TasksRepository();
        const enqueue = vi.spyOn(repository, "enqueue").mockResolvedValue(7);

        await expect(repository.enqueuePayOSCancellation(tx as never, "attempt-1", { attemptId: "attempt-1" }, new Date(now.getTime() + 15_000)))
            .resolves.toMatchObject({ taskId: 7, dueAt: new Date(now.getTime() + 35_000) });
        expect(enqueue).toHaveBeenCalledWith(tx, expect.objectContaining({
            kind: "PAYOS_RECONCILE", key: expect.stringMatching(/^payos:attempt-1:cancel:/), dueAt: new Date(now.getTime() + 35_000),
        }));
    });

    it("coalesces an active cancellation task and permits a new key after terminal completion", async () => {
        const now = new Date("2026-10-14T00:00:00Z");
        const tx = { query: vi.fn(async (_sql: string, values: unknown[] = []) => String(values[0]).includes(":cancel:%")
            ? [{ id: 9, state: "READY", due_at: now, lease_expires_at: null }]
            : []) };
        const repository = new TasksRepository();
        const enqueue = vi.spyOn(repository, "enqueue").mockResolvedValue(10);

        await expect(repository.enqueuePayOSCancellation(tx as never, "attempt-1", {}, now)).resolves.toMatchObject({ taskId: 9 });
        expect(enqueue).not.toHaveBeenCalled();

        tx.query.mockImplementation(async () => []);
        await expect(repository.enqueuePayOSCancellation(tx as never, "attempt-1", {}, now)).resolves.toMatchObject({ taskId: 10 });
        expect(enqueue).toHaveBeenCalledWith(tx, expect.objectContaining({ key: expect.stringMatching(/^payos:attempt-1:cancel:/) }));
    });

    it("namespaces explicit reconciliation flows so terminal generations do not block a later request", async () => {
        const now = new Date("2026-10-14T00:00:00Z");
        const tx = { query: vi.fn().mockResolvedValue([]) };
        const repository = new TasksRepository();
        const enqueue = vi.spyOn(repository, "enqueue").mockResolvedValue(12);

        await expect(repository.enqueuePayOSReconciliationRequest(tx as never, "attempt-1", { attemptId: "attempt-1" }, now))
            .resolves.toMatchObject({ taskId: 12 });
        expect(enqueue).toHaveBeenCalledWith(tx, expect.objectContaining({
            key: expect.stringMatching(/^payos:attempt-1:request:[0-9a-f-]+:0$/i),
            payload: expect.objectContaining({ flowId: expect.any(String) }),
        }));
    });

    it("enqueues the next generation in the fenced completion transaction", async () => {
        const now = new Date("2026-10-14T00:00:00Z");
        const calls: Array<{ sql: string; values: unknown[] }> = [];
        const tx = { query: vi.fn(async (sql: string, values: unknown[] = []) => {
            calls.push({ sql, values });
            if (sql.startsWith("SELECT state, lease_token")) return [{ state: "RUNNING", lease_token: "lease", lease_expires_at: new Date(now.getTime() + 10000), lease_active: 1 }];
            if (sql.startsWith("SELECT id, payload_hash")) return [{ id: 12, payload_hash: values && calls.find((call) => call.sql.startsWith("INSERT INTO operations_tasks"))?.values[3] }];
            if (sql.startsWith("UPDATE operations_tasks")) return { affectedRows: 1 };
            return { affectedRows: 1 };
        }) };
        vi.mocked(withTransaction).mockImplementation(async (work) => work(tx as never));
        const repository = new TasksRepository();
        const finished = await repository.finish({ id: 4, kind: "PAYOS_RECONCILE", key: "payos:a:0", payload: {}, token: "lease", attempt: 1,
            expiresAt: new Date(now.getTime() + 10000), firstAttemptAt: now }, {
            kind: "success", continuation: { kind: "PAYOS_RECONCILE", key: "payos:a:1", payload: { attemptId: "a", generation: 1 }, dueAt: new Date(now.getTime() + 30000) },
        }, now);

        expect(finished).toBe(true);
        expect(calls.findIndex((call) => call.sql.startsWith("INSERT INTO operations_tasks")))
            .toBeLessThan(calls.findIndex((call) => call.sql.startsWith("UPDATE operations_tasks")));
        expect(calls[1].values).toEqual(expect.arrayContaining(["PAYOS_RECONCILE", "payos:a:1"]));
    });

    it("does not enqueue a continuation after losing the lease", async () => {
        const now = new Date("2026-10-14T00:00:00Z");
        const tx = { query: vi.fn().mockResolvedValue([{ state: "RUNNING", lease_token: "new-owner", lease_expires_at: new Date(now.getTime() + 10000) }]) };
        vi.mocked(withTransaction).mockImplementation(async (work) => work(tx as never));
        const repository = new TasksRepository();
        await expect(repository.finish({ id: 4, kind: "PAYOS_RECONCILE", key: "payos:a:0", payload: {}, token: "stale", attempt: 1,
            expiresAt: new Date(now.getTime() + 10000), firstAttemptAt: now }, {
            kind: "success", continuation: { kind: "PAYOS_RECONCILE", key: "payos:a:1", payload: {}, dueAt: now },
        }, now)).resolves.toBe(false);
        expect(tx.query).toHaveBeenCalledTimes(1);
    });
});
