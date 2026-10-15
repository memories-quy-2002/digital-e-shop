import type { EmailProviderError } from "./email.types";

export const EMAIL_AMBIGUITY_CUTOFF_MS = 23 * 60 * 60 * 1000;

export type EmailRetryDecision =
    | { kind: "send" }
    | { kind: "retryable" | "permanent" | "ambiguous"; reason: string; retryAfterMs?: number };

export function emailRetryPolicy(input: {
    attempt: number;
    firstAttemptAt: Date;
    now: Date;
    providerError?: Pick<EmailProviderError, "statusCode" | "retryAfterMs">;
}): EmailRetryDecision {
    if (input.attempt > 1 && input.now.getTime() - input.firstAttemptAt.getTime() >= EMAIL_AMBIGUITY_CUTOFF_MS) {
        return { kind: "ambiguous", reason: "idempotency_window_near_expiry" };
    }
    if (!input.providerError) return { kind: "send" };
    const { statusCode, retryAfterMs } = input.providerError;
    if (statusCode === 429) return { kind: "retryable", reason: "provider_rate_limited", retryAfterMs };
    if (statusCode === null) return { kind: "retryable", reason: "provider_network_unavailable", retryAfterMs };
    if (statusCode >= 500) return { kind: "retryable", reason: "provider_temporarily_unavailable", retryAfterMs };
    return { kind: "permanent", reason: "provider_rejected_request" };
}

export function providerError(statusCode: number | null, retryAfterMs?: number): EmailProviderError {
    const error = new Error("Email provider request failed") as EmailProviderError;
    error.statusCode = statusCode;
    if (Number.isFinite(retryAfterMs) && retryAfterMs! >= 0) error.retryAfterMs = retryAfterMs;
    return error;
}
