import { Injectable, ConflictException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { withTransaction, type TransactionContext } from "../database/transaction";
import { boundBatch, hashTaskPayload, nextTaskOutcome } from "./tasks.policy";
import type { EnqueueTask, TaskKind, TaskLease, TaskResult } from "./tasks.types";

type TaskRow = {
    id: number; kind: TaskKind; business_key: string; payload: string | object;
    payload_hash: string; attempt: number; first_attempt_at: Date | null;
};

class TaskLeaseLostError extends Error {}

@Injectable()
export class TasksRepository {
    async enqueuePayOSCancellation(tx: TransactionContext, attemptId: string, payload: object, dueAt: Date): Promise<{ taskId: number; dueAt: Date }> {
        const active = await tx.query<Array<{ id: number; due_at: Date | string; lease_expires_at: Date | string | null; state: string }>>(
            `SELECT id, due_at, lease_expires_at, state FROM operations_tasks
             WHERE kind = 'PAYOS_RECONCILE' AND business_key LIKE ? AND state IN ('READY', 'RUNNING')
             ORDER BY due_at DESC LIMIT 1 FOR UPDATE`, [`payos:${attemptId}:cancel:%`],
        );
        if (active[0]) {
            const due = active[0].state === "RUNNING" && active[0].lease_expires_at ? active[0].lease_expires_at : active[0].due_at;
            return { taskId: Number(active[0].id), dueAt: due instanceof Date ? new Date(due.getTime()) : new Date(due) };
        }
        const scheduledAt = await this.separatePayOSCalls(tx, attemptId, dueAt);
        const flowId = randomUUID();
        const taskId = await this.enqueue(tx, {
            kind: "PAYOS_RECONCILE", key: `payos:${attemptId}:cancel:${flowId}:0`,
            payload: { ...payload, flowId }, dueAt: scheduledAt,
        });
        return { taskId, dueAt: scheduledAt };
    }

    async enqueuePayOSReconciliationRequest(tx: TransactionContext, attemptId: string, payload: object, dueAt: Date): Promise<{ taskId: number; dueAt: Date }> {
        const scheduledAt = await this.separatePayOSCalls(tx, attemptId, dueAt);
        const flowId = randomUUID();
        const taskId = await this.enqueue(tx, {
            kind: "PAYOS_RECONCILE", key: `payos:${attemptId}:request:${flowId}:0`,
            payload: { ...payload, flowId }, dueAt: scheduledAt,
        });
        return { taskId, dueAt: scheduledAt };
    }

    async enqueuePayOSWebhookRecovery(tx: TransactionContext, attemptId: string, eventId: number, payload: object, dueAt: Date): Promise<{ taskId: number; dueAt: Date }> {
        const scheduledAt = await this.separatePayOSCalls(tx, attemptId, dueAt);
        const flowId = `webhook-${eventId}`;
        const taskId = await this.enqueue(tx, {
            kind: "PAYOS_RECONCILE", key: `payos:${attemptId}:webhook:${eventId}:0`,
            payload: { ...payload, flowId }, dueAt: scheduledAt,
        });
        return { taskId, dueAt: scheduledAt };
    }

    private async separatePayOSCalls(tx: TransactionContext, attemptId: string, dueAt: Date): Promise<Date> {
        const pending = await tx.query<Array<{ due_at: Date | string; lease_expires_at: Date | string | null; state: string }>>(
            `SELECT state, due_at, lease_expires_at FROM operations_tasks
             WHERE kind = 'PAYOS_RECONCILE' AND business_key LIKE ? AND state IN ('READY', 'RUNNING')
             ORDER BY due_at DESC LIMIT 20 FOR UPDATE`, [`payos:${attemptId}:%`],
        );
        let nextDueAt = dueAt;
        for (const task of pending) {
            const nextProviderCallAt = task.state === "RUNNING" && task.lease_expires_at
                ? new Date(task.lease_expires_at)
                : new Date(task.due_at);
            const separatedDueAt = new Date(nextProviderCallAt.getTime() + 15_000);
            if (nextProviderCallAt.getTime() <= nextDueAt.getTime() + 15_000 && separatedDueAt > nextDueAt) nextDueAt = separatedDueAt;
        }
        return nextDueAt;
    }

    async enqueue(tx: TransactionContext, input: EnqueueTask): Promise<number> {
        if (input.kind === "SHIPMENT_CREATE" || input.kind === "SHIPMENT_SYNC") {
            throw new Error("Shipping tasks are retired");
        }
        if (!["EMAIL_SEND", "PAYOS_RECONCILE"].includes(input.kind)
            || !input.key || input.key.length > 191) throw new Error("Invalid task identity");
        const hash = hashTaskPayload(input.payload);
        await tx.query(
            `INSERT INTO operations_tasks (kind, business_key, payload, payload_hash, state, due_at)
             VALUES (?, ?, ?, ?, 'READY', COALESCE(?, UTC_TIMESTAMP(3)))
             ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
            [input.kind, input.key, JSON.stringify(input.payload), hash, input.dueAt || null],
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
                if (row.kind === "SHIPMENT_CREATE" || row.kind === "SHIPMENT_SYNC") {
                    await tx.query("UPDATE operations_tasks SET state = 'FAILED', last_reason = 'shipping_provider_retired', lease_token = NULL, lease_expires_at = NULL, updated_at = ? WHERE id = ?", [now, row.id]);
                    continue;
                }
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
        const outcome = nextTaskOutcome(lease.attempt, result, now, lease.kind);
        return withTransaction(async (tx) => {
            const rows = await tx.query<Array<{ state: string; lease_token: string | null; lease_expires_at: Date | null; lease_active: number | string }>>(
                "SELECT state, lease_token, lease_expires_at, (lease_expires_at > UTC_TIMESTAMP(3)) AS lease_active FROM operations_tasks WHERE id = ? FOR UPDATE", [lease.id],
            );
            const current = rows[0];
            if (!current || current.state !== "RUNNING" || current.lease_token !== lease.token
                || Number(current.lease_active) !== 1) return false;

            if (result.kind === "success" && result.continuation) {
                await this.enqueue(tx, result.continuation);
            }
            const update = await tx.query<{ affectedRows: number }>(
                `UPDATE operations_tasks SET state = ?, due_at = ?, last_reason = ?, provider_reference = COALESCE(?, provider_reference),
                 lease_token = NULL, lease_expires_at = NULL, updated_at = ?
                 WHERE id = ? AND state = 'RUNNING' AND lease_token = ? AND lease_expires_at > UTC_TIMESTAMP(3)`,
                [outcome.state, outcome.dueAt, outcome.reason, outcome.providerReference, now, lease.id, lease.token],
            );
            if (update.affectedRows !== 1 && result.kind === "success" && result.continuation) throw new TaskLeaseLostError();
            return update.affectedRows === 1;
        }).catch((error) => {
            if (error instanceof TaskLeaseLostError) return false;
            throw error;
        });
    }
}
