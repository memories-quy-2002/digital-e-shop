import { Injectable } from "@nestjs/common";
import type { TransactionContext } from "../database/transaction";
import { TasksRepository } from "./tasks.repository";
import type { EnqueueTask, TaskLease, TaskResult } from "./tasks.types";

@Injectable()
export class TasksService {
    constructor(private readonly repository: TasksRepository) {}
    enqueue(tx: TransactionContext, input: EnqueueTask): Promise<number> { return this.repository.enqueue(tx, input); }
    enqueuePayOSCancellation(tx: TransactionContext, attemptId: string, payload: object, dueAt: Date): Promise<{ taskId: number; dueAt: Date }> {
        return this.repository.enqueuePayOSCancellation(tx, attemptId, payload, dueAt);
    }
    enqueuePayOSReconciliationRequest(tx: TransactionContext, attemptId: string, payload: object, dueAt: Date): Promise<{ taskId: number; dueAt: Date }> {
        return this.repository.enqueuePayOSReconciliationRequest(tx, attemptId, payload, dueAt);
    }
    enqueuePayOSWebhookRecovery(tx: TransactionContext, attemptId: string, eventId: number, payload: object, dueAt: Date): Promise<{ taskId: number; dueAt: Date }> {
        return this.repository.enqueuePayOSWebhookRecovery(tx, attemptId, eventId, payload, dueAt);
    }
    claimDue(limit = 20, now = new Date()): Promise<TaskLease[]> { return this.repository.claimDue(limit, now); }
    finish(lease: TaskLease, result: TaskResult, now = new Date()): Promise<boolean> { return this.repository.finish(lease, result, now); }
}
