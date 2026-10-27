import { describe, expect, it, vi } from "vitest";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { ROLES_KEY } from "../../guards/roles.guard";
import { AuthGuard } from "../../guards/auth.guard";
import { RolesGuard } from "../../guards/roles.guard";
import { TaskRunnerController, authorizeRunnerSecret } from "../task-runner.controller";
import { TaskRunnerService } from "../task-runner.service";
import { PayOSReconciliationTaskProcessor } from "../payos-reconciliation-task.processor";
import type { TaskLease } from "../tasks.types";

const makeLease = (kind: TaskLease["kind"], id: number): TaskLease => ({
    id, kind, key: `key-${id}`, payload: kind === "EMAIL_SEND" ? { emailId: id } : { orderId: id },
    token: `token-${id}`, attempt: 1, expiresAt: new Date(Date.now() + 60000), firstAttemptAt: new Date(),
});

describe("bounded task runner", () => {
    it("maps reconciliation outcomes and schedules a bounded next generation for PENDING", async () => {
        const reconcile = vi.fn().mockResolvedValueOnce({ outcome: "MATCHED" }).mockResolvedValueOnce({ outcome: "PENDING" })
            .mockResolvedValueOnce({ outcome: "UNAVAILABLE" }).mockResolvedValueOnce({ outcome: "MISMATCH" });
        const processor = new PayOSReconciliationTaskProcessor({ reconcilePendingCheckoutForTask: reconcile } as never);
        const lease = { ...makeLease("PAYOS_RECONCILE", 3), payload: {
            attemptId: "attempt-1", pendingCheckoutId: 7, generation: 2, expiresAt: new Date(Date.now() + 3600000).toISOString(),
        } };

        await expect(processor.process(lease)).resolves.toEqual({ kind: "success", providerReference: "7" });
        await expect(processor.process(lease)).resolves.toMatchObject({ kind: "success", continuation: {
            kind: "PAYOS_RECONCILE", key: "payos:attempt-1:3", payload: { generation: 3 },
        } });
        await expect(processor.process(lease)).resolves.toEqual({ kind: "retryable", reason: "provider_unavailable" });
        await expect(processor.process(lease)).resolves.toEqual({ kind: "permanent", reason: "verified_payment_mismatch" });
        expect(reconcile).toHaveBeenCalledTimes(4);
    });

    it("stops scheduling provider lookups after the expiry follow-up window", async () => {
        const reconcile = vi.fn();
        const processor = new PayOSReconciliationTaskProcessor({ reconcilePendingCheckoutForTask: reconcile } as never);
        const lease = { ...makeLease("PAYOS_RECONCILE", 4), payload: {
            attemptId: "attempt-1", pendingCheckoutId: 8, generation: 20,
            expiresAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
        } };

        await expect(processor.process(lease)).resolves.toEqual({ kind: "permanent", reason: "reconciliation_window_elapsed" });
        expect(reconcile).not.toHaveBeenCalled();
    });

    it("claims one lease at a time, dispatches by kind, and fences completion", async () => {
        const leases = [makeLease("EMAIL_SEND", 1), makeLease("SHIPMENT_SYNC", 2)];
        const tasks = { claimDue: vi.fn().mockResolvedValueOnce([leases[0]]).mockResolvedValueOnce([leases[1]]).mockResolvedValueOnce([]), finish: vi.fn().mockResolvedValue(true) };
        const email = { processEmail: vi.fn().mockResolvedValue({ kind: "success", providerReference: "re_1" }) };
        const runner = new TaskRunnerService(tasks as never, email as never);
        await expect(runner.run({ limit: 10, budgetMs: 20000 })).resolves.toMatchObject({
            claimed: 2, succeeded: 1, retried: 0, failed: 1, reviewRequired: 0,
        });
        expect(tasks.claimDue).toHaveBeenNthCalledWith(1, 1, expect.any(Date));
        expect(tasks.claimDue).toHaveBeenNthCalledWith(2, 1, expect.any(Date));
        expect(tasks.finish).toHaveBeenCalledWith(leases[0], { kind: "success", providerReference: "re_1" }, expect.any(Date));
        expect(email.processEmail).toHaveBeenCalledWith(leases[0]);
        expect(tasks.finish).toHaveBeenCalledWith(leases[1], { kind: "permanent", reason: "shipping_provider_retired" }, expect.any(Date));
    });

    it("permanently terminates queued carrier tasks without dispatching network work", async () => {
        const leases = [makeLease("SHIPMENT_CREATE", 31), makeLease("SHIPMENT_SYNC", 32)];
        const tasks = {
            claimDue: vi.fn().mockResolvedValueOnce([leases[0]]).mockResolvedValueOnce([leases[1]]).mockResolvedValueOnce([]),
            finish: vi.fn().mockResolvedValue(true),
        };
        const email = { processEmail: vi.fn() };
        const runner = new TaskRunnerService(tasks as never, email as never);

        await expect(runner.run({ limit: 2, budgetMs: 20000 })).resolves.toMatchObject({ claimed: 2, failed: 2, retried: 0 });
        expect(tasks.finish).toHaveBeenNthCalledWith(1, leases[0], { kind: "permanent", reason: "shipping_provider_retired" }, expect.any(Date));
        expect(tasks.finish).toHaveBeenNthCalledWith(2, leases[1], { kind: "permanent", reason: "shipping_provider_retired" }, expect.any(Date));
        expect(email.processEmail).not.toHaveBeenCalled();
    });

    it("stops claiming when the time budget is reached and validates bounds", async () => {
        vi.useFakeTimers();
        const leases = [makeLease("EMAIL_SEND", 1), makeLease("EMAIL_SEND", 2), makeLease("EMAIL_SEND", 3)];
        const tasks = { claimDue: vi.fn().mockImplementation(() => Promise.resolve([leases[tasks.claimDue.mock.calls.length - 1]])), finish: vi.fn().mockResolvedValue(true) };
        const email = { processEmail: vi.fn().mockImplementation(async () => { await vi.advanceTimersByTimeAsync(8000); return { kind: "success" }; }) };
        const runner = new TaskRunnerService(tasks as never, email as never);
        await expect(runner.run({ limit: 100, budgetMs: 20000 })).resolves.toMatchObject({ claimed: 2, succeeded: 2, failed: 0 });
        await expect(runner.run({ limit: 101, budgetMs: 20000 })).rejects.toThrow();
        await expect(runner.run({ limit: 1, budgetMs: 20001 })).rejects.toThrow();
        vi.useRealTimers();
    });

    it("does not count a result when the lease was lost before finish", async () => {
        const lease = makeLease("EMAIL_SEND", 1);
        const tasks = { claimDue: vi.fn().mockResolvedValueOnce([lease]).mockResolvedValueOnce([]), finish: vi.fn().mockResolvedValue(false) };
        const email = { processEmail: vi.fn().mockResolvedValue({ kind: "success" }) };
        const runner = new TaskRunnerService(tasks as never, email as never);
        await expect(runner.run({ limit: 1, budgetMs: 20000 })).resolves.toMatchObject({ claimed: 1, succeeded: 0, reviewRequired: 0 });
    });

    it("dispatches PayOS reconciliation only to its focused processor and retries transient results", async () => {
        const lease = makeLease("PAYOS_RECONCILE", 7);
        const tasks = { claimDue: vi.fn().mockResolvedValueOnce([lease]).mockResolvedValueOnce([]), finish: vi.fn().mockResolvedValue(true) };
        const email = { processEmail: vi.fn() };
        const payos = { process: vi.fn().mockResolvedValue({ kind: "retryable", reason: "provider_unavailable" }) };
        const runner = new TaskRunnerService(tasks as never, email as never, payos);

        await expect(runner.run({ limit: 1, budgetMs: 20000 })).resolves.toMatchObject({ claimed: 1, retried: 1, failed: 0 });
        expect(payos.process).toHaveBeenCalledWith(lease);
        expect(email.processEmail).not.toHaveBeenCalled();
    });

    it("marks durable PayOS mismatches for review rather than as ordinary failed operations", async () => {
        const lease = makeLease("PAYOS_RECONCILE", 8);
        const tasks = { claimDue: vi.fn().mockResolvedValueOnce([lease]).mockResolvedValueOnce([]), finish: vi.fn().mockResolvedValue(true) };
        const runner = new TaskRunnerService(tasks as never, {} as never, {
            process: vi.fn().mockResolvedValue({ kind: "permanent", reason: "verified_payment_mismatch" }),
        });

        await expect(runner.run({ limit: 1, budgetMs: 20000 })).resolves.toMatchObject({ reviewRequired: 1, failed: 0 });
    });

    it("finishes unexpected email processor exceptions as ambiguous for review", async () => {
        const lease = makeLease("EMAIL_SEND", 1);
        const tasks = { claimDue: vi.fn().mockResolvedValueOnce([lease]).mockResolvedValueOnce([]), finish: vi.fn().mockResolvedValue(true) };
        const runner = new TaskRunnerService(tasks as never, { processEmail: vi.fn().mockRejectedValue(new Error("failed")) } as never);
        await expect(runner.run({ limit: 1, budgetMs: 20000 })).resolves.toMatchObject({ claimed: 1, reviewRequired: 1 });
        expect(tasks.finish).toHaveBeenCalledWith(lease, { kind: "ambiguous", reason: "task_processor_error" }, expect.any(Date));
    });
});

describe("operations runner authentication", () => {
    it("fails closed for missing and wrong bearer secrets and accepts an exact match", () => {
        expect(authorizeRunnerSecret(undefined, "secret-value")).toBe(false);
        expect(authorizeRunnerSecret("Bearer wrong", "secret-value")).toBe(false);
        expect(authorizeRunnerSecret("Bearer secret-value", undefined)).toBe(false);
        expect(authorizeRunnerSecret("Bearer secret-value", "secret-value")).toBe(true);
    });

    it("keeps scheduler auth separate from guarded admin drain", () => {
        const cron = TaskRunnerController.prototype.runScheduledCron;
        const scheduler = TaskRunnerController.prototype.runScheduled;
        const admin = TaskRunnerController.prototype.runAdmin;
        expect(Reflect.getMetadata(GUARDS_METADATA, admin)).toEqual([AuthGuard, RolesGuard]);
        expect(Reflect.getMetadata(ROLES_KEY, admin)).toEqual(["admin"]);
        expect(Reflect.getMetadata(GUARDS_METADATA, cron)).toBeUndefined();
        expect(Reflect.getMetadata(GUARDS_METADATA, scheduler)).toBeUndefined();
    });

    it("authorizes Vercel cron requests with CRON_SECRET and uses the fixed runner bounds", async () => {
        const previousSecret = process.env.CRON_SECRET;
        process.env.CRON_SECRET = "cron-secret";
        const run = vi.fn().mockResolvedValue({ claimed: 0 });
        const controller = new TaskRunnerController({ run } as never);

        try {
            await expect(controller.runScheduledCron(undefined)).rejects.toThrow("Unauthorized");
            await expect(controller.runScheduledCron("Bearer wrong")).rejects.toThrow("Unauthorized");
            await expect(controller.runScheduledCron("Bearer cron-secret")).resolves.toEqual({ claimed: 0 });
            expect(run).toHaveBeenCalledTimes(1);
            expect(run).toHaveBeenCalledWith({ limit: 20, budgetMs: 20000 });
        } finally {
            if (previousSecret === undefined) delete process.env.CRON_SECRET;
            else process.env.CRON_SECRET = previousSecret;
        }
    });
});
