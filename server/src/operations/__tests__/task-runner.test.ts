import { describe, expect, it, vi } from "vitest";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { ROLES_KEY } from "../../guards/roles.guard";
import { AuthGuard } from "../../guards/auth.guard";
import { RolesGuard } from "../../guards/roles.guard";
import { TaskRunnerController, authorizeRunnerSecret } from "../task-runner.controller";
import { TaskRunnerService } from "../task-runner.service";
import type { TaskLease } from "../tasks.types";

const makeLease = (kind: TaskLease["kind"], id: number): TaskLease => ({
    id, kind, key: `key-${id}`, payload: kind === "EMAIL_SEND" ? { emailId: id } : { orderId: id },
    token: `token-${id}`, attempt: 1, expiresAt: new Date(Date.now() + 60000), firstAttemptAt: new Date(),
});

describe("bounded task runner", () => {
    it("claims one lease at a time, dispatches by kind, and fences completion", async () => {
        const leases = [makeLease("EMAIL_SEND", 1), makeLease("SHIPMENT_SYNC", 2)];
        const tasks = { claimDue: vi.fn().mockResolvedValueOnce([leases[0]]).mockResolvedValueOnce([leases[1]]).mockResolvedValueOnce([]), finish: vi.fn().mockResolvedValue(true) };
        const email = { processEmail: vi.fn().mockResolvedValue({ kind: "success", providerReference: "re_1" }) };
        const shipping = { process: vi.fn().mockResolvedValue({ kind: "retryable", reason: "provider_busy", retryAfterMs: 5000 }) };
        const runner = new TaskRunnerService(tasks as never, email as never, shipping);
        await expect(runner.run({ limit: 10, budgetMs: 20000 })).resolves.toMatchObject({
            claimed: 2, succeeded: 1, retried: 1, failed: 0, reviewRequired: 0,
        });
        expect(tasks.claimDue).toHaveBeenNthCalledWith(1, 1, expect.any(Date));
        expect(tasks.claimDue).toHaveBeenNthCalledWith(2, 1, expect.any(Date));
        expect(tasks.finish).toHaveBeenCalledWith(leases[0], { kind: "success", providerReference: "re_1" }, expect.any(Date));
        expect(email.processEmail).toHaveBeenCalledWith(leases[0]);
        expect(shipping.process).toHaveBeenCalledWith(leases[1]);
    });

    it("stops claiming when the time budget is reached and validates bounds", async () => {
        vi.useFakeTimers();
        const leases = [makeLease("SHIPMENT_CREATE", 1), makeLease("SHIPMENT_CREATE", 2), makeLease("SHIPMENT_CREATE", 3)];
        const tasks = { claimDue: vi.fn().mockImplementation(() => Promise.resolve([leases[tasks.claimDue.mock.calls.length - 1]])), finish: vi.fn().mockResolvedValue(true) };
        const shipping = { process: vi.fn().mockImplementation(async () => { await vi.advanceTimersByTimeAsync(8000); return { kind: "success" }; }) };
        const runner = new TaskRunnerService(tasks as never, {} as never, shipping);
        await expect(runner.run({ limit: 100, budgetMs: 20000 })).resolves.toMatchObject({ claimed: 1, succeeded: 1 });
        await expect(runner.run({ limit: 101, budgetMs: 20000 })).rejects.toThrow();
        await expect(runner.run({ limit: 1, budgetMs: 20001 })).rejects.toThrow();
        vi.useRealTimers();
    });

    it("does not count a result when the lease was lost before finish", async () => {
        const lease = makeLease("EMAIL_SEND", 1);
        const tasks = { claimDue: vi.fn().mockResolvedValueOnce([lease]).mockResolvedValueOnce([]), finish: vi.fn().mockResolvedValue(false) };
        const email = { processEmail: vi.fn().mockResolvedValue({ kind: "success" }) };
        const runner = new TaskRunnerService(tasks as never, email as never, { process: vi.fn() });
        await expect(runner.run({ limit: 1, budgetMs: 20000 })).resolves.toMatchObject({ claimed: 1, succeeded: 0, reviewRequired: 0 });
    });

    it("finishes unexpected processor exceptions as ambiguous for review", async () => {
        const lease = makeLease("SHIPMENT_CREATE", 1);
        const tasks = { claimDue: vi.fn().mockResolvedValueOnce([lease]).mockResolvedValueOnce([]), finish: vi.fn().mockResolvedValue(true) };
        const shipping = { process: vi.fn().mockRejectedValue(new Error("provider detail must not leak")) };
        const runner = new TaskRunnerService(tasks as never, {} as never, shipping);
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
        const scheduler = TaskRunnerController.prototype.runScheduled;
        const admin = TaskRunnerController.prototype.runAdmin;
        expect(Reflect.getMetadata(GUARDS_METADATA, admin)).toEqual([AuthGuard, RolesGuard]);
        expect(Reflect.getMetadata(ROLES_KEY, admin)).toEqual(["admin"]);
        expect(Reflect.getMetadata(GUARDS_METADATA, scheduler)).toBeUndefined();
    });
});
