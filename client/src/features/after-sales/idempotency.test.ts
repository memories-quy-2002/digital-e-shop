import { describe, expect, it } from "vitest";
import { getStableIdempotencyKey } from "./idempotency";

describe("getStableIdempotencyRequest", () => {
    it("reuses a key for an unchanged request and rotates it when the payload changes", () => {
        const first = getStableIdempotencyKey({ orderId: 42, reason: "Damaged" }, null);
        const retry = getStableIdempotencyKey({ orderId: 42, reason: "Damaged" }, first);
        const edited = getStableIdempotencyKey({ orderId: 42, reason: "Wrong item" }, retry);

        expect(retry.key).toBe(first.key);
        expect(edited.key).not.toBe(first.key);
    });
});
