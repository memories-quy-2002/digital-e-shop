import { createHash } from "node:crypto";
import type { TaskResult, TaskState } from "./tasks.types";

function canonical(value: unknown): string {
    if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
    if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
    }
    throw new Error("Task payload must contain JSON values only");
}

export function hashTaskPayload(payload: object): string {
    const serialized = canonical(payload);
    if (Buffer.byteLength(serialized) > 65536) throw new Error("Task payload exceeds 64 KiB");
    return createHash("sha256").update(serialized).digest("hex");
}

export function boundBatch(limit = 20): number {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error("Batch must be 1 to 100");
    return limit;
}

export function nextTaskOutcome(attempt: number, result: TaskResult, now: Date): {
    state: TaskState; dueAt: Date; reason: string | null; providerReference: string | null;
} {
    if (result.kind === "success") return { state: "SUCCEEDED", dueAt: now, reason: null, providerReference: result.providerReference || null };
    const state = result.kind === "ambiguous" ? "REVIEW_REQUIRED" : result.kind === "permanent" || attempt >= 8 ? "FAILED" : "READY";
    const delay = [30000, 120000, 300000, 900000, 3600000, 10800000, 21600000][Math.min(6, Math.max(0, attempt - 1))];
    const hint = Number.isFinite(result.retryAfterMs) ? Math.min(21600000, Math.max(0, result.retryAfterMs || 0)) : 0;
    return { state, dueAt: new Date(now.getTime() + Math.max(delay, hint)), reason: result.reason.slice(0, 80), providerReference: null };
}
