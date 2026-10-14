import { Injectable } from "@nestjs/common";
import type { TransactionContext } from "../database/transaction";
import { TasksRepository } from "./tasks.repository";
import type { EnqueueTask, TaskLease, TaskResult } from "./tasks.types";

@Injectable()
export class TasksService {
    constructor(private readonly repository: TasksRepository) {}
    enqueue(tx: TransactionContext, input: EnqueueTask): Promise<number> { return this.repository.enqueue(tx, input); }
    claimDue(limit = 20, now = new Date()): Promise<TaskLease[]> { return this.repository.claimDue(limit, now); }
    finish(lease: TaskLease, result: TaskResult, now = new Date()): Promise<boolean> { return this.repository.finish(lease, result, now); }
}
