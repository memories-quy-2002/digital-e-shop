import { describe, expect, it } from "vitest";
import { parseOrderIdentifier } from "./identifiers";

describe("parseOrderIdentifier", () => {
    it("accepts UUIDv7 public references and legacy positive numeric IDs", () => {
        expect(parseOrderIdentifier("019a0000-0000-7000-8000-000000000001")).toBe("019a0000-0000-7000-8000-000000000001");
        expect(parseOrderIdentifier("42")).toBe(42);
    });

    it("rejects malformed, non-v7, and unsafe numeric identifiers", () => {
        expect(parseOrderIdentifier("123e4567-e89b-42d3-a456-426614174001")).toBeNull();
        expect(parseOrderIdentifier("0")).toBeNull();
        expect(parseOrderIdentifier("9007199254740992")).toBeNull();
    });
});
