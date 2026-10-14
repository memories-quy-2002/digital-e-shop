import { Injectable, ConflictException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { withTransaction, type TransactionContext } from "../database/transaction";
import { boundBatch, hashTaskPayload, nextTaskOutcome } from "./tasks.policy";
import type { EnqueueTask, TaskKind, TaskLease, TaskResult } from "./tasks.types";

type TaskRow = {
    id: number; kind: TaskKind; business_key: string; payload: string | object;
    payload_hash: string; attempt: number; first_attempt_at: Date | null;
};

@Injectable()
export class TasksRepository {
    async enqueue(tx: TransactionContext, input: EnqueueTask): Promise<number> {
        if (!["SHIPMENT_CREATE", "SHIPMENT_SYNC", "EMAIL_SEND"].includes(input.kind)
            || !input.key || input.key.length > 191) throw new Error("Invalid task identity");
        const hash = hashTaskPayload(input.payload);
        await tx.query(
            `INSERT INTO operations_tasks (kind, business_key, payload, payload_hash, state, due_at)
             VALUES (?, ?, ?, ?, 'READY', UTC_TIMESTAMP(3))
             ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
            [input.kind, input.key, JSON.stringify(input.payload), hash],
        );
        const [row] = await tx.query<TaskRow[]>(
            "SELECT id, payload_hash FROM operations_tasks WHERE kind = ? AND business_key = ? FOR UPDATE", [input.kind, input.key],
        );
        if (row.payload_hash !== hash) throw new ConflictException("Operation key already has different facts");
        return Number(row.id);
    }

    claimDue(limit = 20, now = new Date(), businessKeyPrefix?: string): Promise<TaskLease[]> {
        boundBatch(limit);
        return withTransaction(async (tx) => {
            // Lock only the bounded due set. Network work starts after this transaction commits.
            const scope = businessKeyPrefix ? "business_key LIKE ?" : "";
            const values = businessKeyPrefix
                ? [`${businessKeyPrefix}%`, now, now, limit]
                : [now, now, limit];
            const rows = await tx.query<TaskRow[]>(
                `SELECT id, kind, business_key, payload, attempt, first_attempt_at FROM operations_tasks
                 WHERE ${scope ? `${scope} AND ` : ""}((state = 'READY' AND due_at <= ?) OR (state = 'RUNNING' AND lease_expires_at <= ?))
                 ORDER BY due_at, id LIMIT ? FOR UPDATE SKIP LOCKED`, values,
            );
            const leases: TaskLease[] = [];
            for (const row of rows) {
                if (row.attempt >= 8) {
                    await tx.query("UPDATE operations_tasks SET state = 'REVIEW_REQUIRED', last_reason = 'lease_attempts_exhausted', lease_token = NULL, lease_expires_at = NULL WHERE id = ?", [row.id]);
                    continue;
                }
                const token = randomUUID();
                const expiresAt = new Date(now.getTime() + 60000);
                await tx.query(
                    `UPDATE operations_tasks SET state = 'RUNNING', attempt = attempt + 1, lease_token = ?, lease_expires_at = ?,
                     first_attempt_at = COALESCE(first_attempt_at, ?), updated_at = ? WHERE id = ?`, [token, expiresAt, now, now, row.id],
                );
                leases.push({ id: Number(row.id), kind: row.kind, key: row.business_key,
                    payload: typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload,
                    token, attempt: row.attempt + 1, expiresAt, firstAttemptAt: row.first_attempt_at || now });
            }
            return leases;
        });
    }

    finish(lease: TaskLease, result: TaskResult, now = new Date()): Promise<boolean> {
        const outcome = nextTaskOutcome(lease.attempt, result, now);
        return withTransaction(async (tx) => {
            const update = await tx.query<{ affectedRows: number }>(
                `UPDATE operations_tasks SET state = ?, due_at = ?, last_reason = ?, provider_reference = COALESCE(?, provider_reference),
                 lease_token = NULL, lease_expires_at = NULL, updated_at = ?
                 WHERE id = ? AND state = 'RUNNING' AND lease_token = ? AND lease_expires_at > ?`,
                [outcome.state, outcome.dueAt, outcome.reason, outcome.providerReference, now, lease.id, lease.token, now],
            );
            return update.affectedRows === 1;
        });
    }
}
