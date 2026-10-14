import { describe, expect, it } from "vitest";
import { hashTaskPayload, boundBatch, nextTaskOutcome } from "../tasks.policy";

describe("durable task policy", () => {
    it("hashes semantic object payloads independently of property insertion order", () => {
        expect(hashTaskPayload({ a: 1, b: { c: 2 } })).toBe(hashTaskPayload({ b: { c: 2 }, a: 1 }));
        expect(hashTaskPayload({ a: 2 })).not.toBe(hashTaskPayload({ a: 1 }));
    });
    it.each([0, -1, 1.5, 101, NaN])("rejects invalid batch %s", (limit) => {
        expect(() => boundBatch(limit)).toThrow();
    });
    it("uses bounded retry backoff and stops exhausted or ambiguous work", () => {
        const now = new Date("2026-10-14T00:00:00Z");
        expect(nextTaskOutcome(1, { kind: "retryable", reason: "timeout" }, now)).toEqual({
            state: "READY", dueAt: new Date("2026-10-14T00:00:30Z"), reason: "timeout", providerReference: null,
        });
        expect(nextTaskOutcome(8, { kind: "retryable", reason: "timeout" }, now).state).toBe("FAILED");
        expect(nextTaskOutcome(1, { kind: "ambiguous", reason: "unknown" }, now).state).toBe("REVIEW_REQUIRED");
        expect(nextTaskOutcome(1, { kind: "success", providerReference: "external-1" }, now).state).toBe("SUCCEEDED");
    });
    it("rejects unsafe payloads instead of silently changing immutable facts", () => {
        expect(() => hashTaskPayload({ x: Infinity })).toThrow();
        expect(() => hashTaskPayload({ x: undefined })).toThrow();
    });
});
