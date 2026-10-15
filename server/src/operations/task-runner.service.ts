import { Inject, Injectable, Optional } from "@nestjs/common";
import { EmailService } from "../transactional-email/email.service";
import { TasksService } from "./tasks.service";
import type { TaskLease, TaskResult } from "./tasks.types";

export const SHIPMENT_TASK_PROCESSOR = Symbol("SHIPMENT_TASK_PROCESSOR");
export const PAYOS_TASK_PROCESSOR = Symbol("PAYOS_TASK_PROCESSOR");
export interface ShipmentTaskProcessor { process(lease: TaskLease): Promise<TaskResult> }
export interface PayOSTaskProcessor { process(lease: TaskLease): Promise<TaskResult> }
export type TaskRunnerInput = { limit?: number; budgetMs?: number };
export type TaskRunnerSummary = { claimed: number; succeeded: number; retried: number; failed: number; reviewRequired: number; elapsedMs: number };

@Injectable()
export class TaskRunnerService {
    constructor(
        private readonly tasks: TasksService,
        private readonly email: EmailService,
        @Optional() @Inject(SHIPMENT_TASK_PROCESSOR) private readonly shipping?: ShipmentTaskProcessor,
        @Optional() @Inject(PAYOS_TASK_PROCESSOR) private readonly payos?: PayOSTaskProcessor,
    ) {}

    async run(input: TaskRunnerInput = {}): Promise<TaskRunnerSummary> {
        const limit = input.limit ?? 20;
        const budgetMs = input.budgetMs ?? 20000;
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error("Runner limit must be an integer from 1 to 100");
        if (!Number.isSafeInteger(budgetMs) || budgetMs < 1 || budgetMs > 20000) throw new Error("Runner budget must be an integer from 1 to 20000 ms");
        const startedAt = Date.now();
        const summary: TaskRunnerSummary = { claimed: 0, succeeded: 0, retried: 0, failed: 0, reviewRequired: 0, elapsedMs: 0 };
        // A shipment may need lookup + create, each with an 8s request timeout.
        // Leave room for both and the short persistence transaction before claiming.
        while (summary.claimed < limit && budgetMs - (Date.now() - startedAt) >= 17000) {
            const [lease] = await this.tasks.claimDue(1, new Date());
            if (!lease) break;
            summary.claimed += 1;
            const result = await this.process(lease);
            const finished = await this.tasks.finish(lease, result, new Date());
            if (finished) {
                if (result.kind === "success") summary.succeeded += 1;
                else if (result.kind === "retryable") summary.retried += 1;
                else if (result.kind === "permanent" && lease.kind !== "PAYOS_RECONCILE") summary.failed += 1;
                else summary.reviewRequired += 1;
            }
        }
        summary.elapsedMs = Math.max(0, Date.now() - startedAt);
        return summary;
    }

    private process(lease: TaskLease): Promise<TaskResult> {
        try {
            if (lease.kind === "EMAIL_SEND") return this.email.processEmail(lease).catch(() => ({ kind: "ambiguous" as const, reason: "task_processor_error" }));
            if (lease.kind === "PAYOS_RECONCILE") return this.payos
                ? Promise.resolve().then(() => this.payos!.process(lease)).catch(() => ({ kind: "retryable" as const, reason: "task_processor_error" }))
                : Promise.resolve({ kind: "retryable", reason: "payos_processor_unavailable" });
            if (this.shipping) return this.shipping.process(lease).catch(() => ({ kind: "ambiguous" as const, reason: "task_processor_error" }));
            return Promise.resolve({ kind: "permanent", reason: "shipment_processor_unavailable" });
        } catch {
            return Promise.resolve({ kind: "ambiguous" as const, reason: "task_processor_error" });
        }
    }
}
