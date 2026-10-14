import { describe, expect, it } from "vitest";
import { emailRetryPolicy, EMAIL_AMBIGUITY_CUTOFF_MS } from "../email.policy";

describe("transactional email retry policy", () => {
    const now = new Date("2026-10-14T12:00:00.000Z");

    it("does not call the provider for a retry at or beyond 23 hours", () => {
        expect(emailRetryPolicy({ attempt: 2, firstAttemptAt: new Date(now.getTime() - EMAIL_AMBIGUITY_CUTOFF_MS), now }))
            .toEqual({ kind: "ambiguous", reason: "idempotency_window_near_expiry" });
    });

    it("allows retries before the ambiguity cutoff and the initial attempt", () => {
        expect(emailRetryPolicy({ attempt: 1, firstAttemptAt: now, now })).toEqual({ kind: "send" });
        expect(emailRetryPolicy({ attempt: 2, firstAttemptAt: new Date(now.getTime() - EMAIL_AMBIGUITY_CUTOFF_MS + 1), now }))
            .toEqual({ kind: "send" });
    });

    it("classifies permanent, temporary and rate-limit provider failures", () => {
        expect(emailRetryPolicy({ attempt: 1, firstAttemptAt: now, now, providerError: { statusCode: 422 } }))
            .toEqual({ kind: "permanent", reason: "provider_rejected_request" });
        expect(emailRetryPolicy({ attempt: 1, firstAttemptAt: now, now, providerError: { statusCode: 429, retryAfterMs: 45000 } }))
            .toEqual({ kind: "retryable", reason: "provider_rate_limited", retryAfterMs: 45000 });
        expect(emailRetryPolicy({ attempt: 1, firstAttemptAt: now, now, providerError: { statusCode: null } }))
            .toEqual({ kind: "retryable", reason: "provider_network_unavailable", retryAfterMs: undefined });
    });
});
