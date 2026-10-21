import { describe, expect, it, vi } from "vitest";
import { reuseOrCreateIdempotencyKey, safeInteger } from "./utils";

describe("procurement form utilities", () => {
    it("reuses a receipt key only while its payload fingerprint is unchanged", () => {
        const createKey = vi.fn().mockReturnValueOnce("key-1").mockReturnValueOnce("key-2");
        const first = reuseOrCreateIdempotencyKey("payload-a", null, createKey);
        expect(reuseOrCreateIdempotencyKey("payload-a", first, createKey)).toBe(first);
        expect(reuseOrCreateIdempotencyKey("payload-b", first, createKey)).toEqual({ fingerprint: "payload-b", key: "key-2" });
        expect(createKey).toHaveBeenCalledTimes(2);
    });

    it("accepts only safe whole numbers", () => {
        expect(safeInteger("42")).toBe(42);
        expect(Number.isNaN(safeInteger("2.5"))).toBe(true);
        expect(Number.isNaN(safeInteger("9007199254740992"))).toBe(true);
    });
});
