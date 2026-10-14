export type TaskKind = "SHIPMENT_CREATE" | "SHIPMENT_SYNC" | "EMAIL_SEND";
export type TaskState = "READY" | "RUNNING" | "SUCCEEDED" | "FAILED" | "REVIEW_REQUIRED";
export type TaskLease = {
    id: number; kind: TaskKind; key: string; payload: object;
    token: string; attempt: number; expiresAt: Date; firstAttemptAt: Date;
};
export type TaskResult =
    | { kind: "success"; providerReference?: string }
    | { kind: "retryable" | "permanent" | "ambiguous"; reason: string; retryAfterMs?: number };
export type EnqueueTask = { kind: TaskKind; key: string; payload: object };
