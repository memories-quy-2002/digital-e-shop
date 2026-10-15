import { Injectable } from "@nestjs/common";
import { PaymentReconciliationService } from "../payments/payment-reconciliation.service";
import type { PayOSTaskProcessor } from "./task-runner.service";
import type { TaskLease, TaskResult } from "./tasks.types";

type PayOSReconciliationResult = {
    outcome: string;
    retryAfterMs?: number;
    retryAfterSeconds?: number;
    cancelSentAt?: string | null;
    verifyOnly?: boolean;
    paymentLinkId?: string;
};

@Injectable()
export class PayOSReconciliationTaskProcessor implements PayOSTaskProcessor {
    constructor(private readonly reconciliation: PaymentReconciliationService) {}

    async process(lease: TaskLease): Promise<TaskResult> {
        const payload = lease.payload as { attemptId?: unknown; pendingCheckoutId?: unknown; generation?: unknown; expiresAt?: unknown; operation?: unknown; cancelRequestedAt?: unknown; cancelSentAt?: unknown; flowId?: unknown; verifyOnly?: unknown; paymentLinkId?: unknown };
        const pendingCheckoutId = Number(payload.pendingCheckoutId);
        const attemptId = typeof payload.attemptId === "string" ? payload.attemptId : "";
        const generation = Number(payload.generation);
        if (!Number.isSafeInteger(pendingCheckoutId) || pendingCheckoutId <= 0
            || !attemptId || attemptId.length > 64 || !Number.isSafeInteger(generation) || generation < 0) {
            return { kind: "permanent", reason: "invalid_pending_checkout" };
        }
        const expiresAt = new Date(String(payload.expiresAt || ""));
        if (!Number.isFinite(expiresAt.getTime()) || Date.now() > expiresAt.getTime() + 24 * 60 * 60 * 1000) {
            return { kind: "permanent", reason: "reconciliation_window_elapsed" };
        }
        try {
            const operation = String(payload.operation || "RECONCILE");
            const isCancellation = operation === "CANCEL" || operation === "CANCEL_LINK";
            const result = (operation === "CANCEL_LINK"
                ? await this.reconciliation.cancelPayOSLinkForTask({
                    pendingCheckoutId, attemptId,
                    paymentLinkId: typeof payload.paymentLinkId === "string" ? payload.paymentLinkId : undefined,
                })
                : operation === "CANCEL"
                    ? await this.reconciliation.cancelPendingCheckoutForTask({
                    pendingCheckoutId, attemptId,
                    cancelSentAt: typeof payload.cancelSentAt === "string" ? payload.cancelSentAt : null,
                    verifyOnly: payload.verifyOnly === true,
                })
                    : await this.reconciliation.reconcilePendingCheckoutForTask(pendingCheckoutId, attemptId)) as PayOSReconciliationResult;
            if (result.outcome === "MATCHED") return { kind: "success", providerReference: String(pendingCheckoutId) };
            if (result.outcome === "CANCEL_REQUIRED") {
                const nextGeneration = generation + 1;
                const flowId = String(payload.flowId || "legacy");
                return {
                    kind: "success",
                    providerReference: String(pendingCheckoutId),
                    continuation: {
                        kind: "PAYOS_RECONCILE",
                        key: `payos:${attemptId}:cancel:${flowId}:${nextGeneration}`,
                        payload: {
                            ...payload, generation: nextGeneration, operation: "CANCEL_LINK",
                            paymentLinkId: result.paymentLinkId, cancelSentAt: null, verifyOnly: false,
                        },
                        dueAt: new Date(Date.now() + 15_000),
                    },
                };
            }
            if (result.outcome === "PENDING") {
                const nextGeneration = generation + 1;
                const baseDelayMs = [30000, 60000, 120000, 240000, 300000][Math.min(4, Math.max(0, generation))];
                const retryAfterHint = Number.isFinite(result.retryAfterMs)
                    ? Number(result.retryAfterMs)
                    : Number.isFinite(result.retryAfterSeconds) ? Number(result.retryAfterSeconds) * 1000 : 0;
                const continuationDelayMs = Math.max(baseDelayMs, Math.min(21600000, Math.max(0, retryAfterHint)));
                const requestedAt = Date.parse(String(payload.cancelRequestedAt || ""));
                const boundedDelayMs = operation === "CANCEL_LINK" ? 15_000
                    : isCancellation && payload.verifyOnly !== true && result.verifyOnly !== true && Number.isFinite(requestedAt)
                    ? Math.min(continuationDelayMs, Math.max(1000, requestedAt + 10 * 60 * 1000 - Date.now()))
                    : continuationDelayMs;
                const nextOperation = operation === "CANCEL_LINK" ? "CANCEL" : operation;
                return {
                    kind: "success",
                    providerReference: String(pendingCheckoutId),
                    continuation: {
                        kind: "PAYOS_RECONCILE",
                        key: isCancellation
                            ? `payos:${attemptId}:cancel:${String(payload.flowId || "legacy")}:${nextGeneration}`
                            : payload.flowId ? `payos:${attemptId}:request:${String(payload.flowId)}:${nextGeneration}` : `payos:${attemptId}:${nextGeneration}`,
                        payload: { ...payload, generation: nextGeneration, ...(isCancellation ? {
                            operation: nextOperation,
                            cancelSentAt: result.cancelSentAt !== undefined ? result.cancelSentAt : payload.cancelSentAt,
                            verifyOnly: result.verifyOnly === true || payload.verifyOnly === true,
                        } : {}) },
                        dueAt: new Date(Date.now() + boundedDelayMs),
                    },
                };
            }
            if (result.outcome === "MISMATCH") return { kind: "permanent", reason: "verified_payment_mismatch" };
            const retryAfterMs = Number.isFinite(result.retryAfterMs)
                ? result.retryAfterMs
                : Number.isFinite(result.retryAfterSeconds) ? Number(result.retryAfterSeconds) * 1000 : undefined;
            return { kind: "retryable", reason: result.outcome === "UNAVAILABLE" ? "provider_unavailable" : "reconciliation_incomplete", retryAfterMs };
        } catch {
            return { kind: "retryable", reason: "reconciliation_transient_failure" };
        }
    }
}
