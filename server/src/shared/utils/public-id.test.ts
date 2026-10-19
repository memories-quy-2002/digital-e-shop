import { afterEach, describe, expect, it, vi } from "vitest";
import { createPublicId, parseResourceId, resourceIdColumn } from "./public-id";

describe("public resource identifiers", () => {
    afterEach(() => vi.restoreAllMocks());

    it("encodes the current millisecond timestamp with RFC 9562 version and variant bits", () => {
        const timestamp = 1777777777123;
        vi.spyOn(Date, "now").mockReturnValue(timestamp);
        const ids = Array.from({ length: 1000 }, () => createPublicId());
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ids) {
            expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
            expect(parseInt(id.replaceAll("-", "").slice(0, 12), 16)).toBe(timestamp);
        }
    });

    it("orders IDs across different millisecond timestamps", () => {
        const now = vi.spyOn(Date, "now").mockReturnValue(1777777777123);
        const earlier = createPublicId();
        now.mockReturnValue(1777777777124);
        expect(earlier < createPublicId()).toBe(true);
    });

    it("normalizes public UUIDs and legacy numeric references into fixed SQL columns", () => {
        const id = createPublicId();
        expect(parseResourceId(id.toUpperCase())).toBe(id);
        expect(parseResourceId("42")).toBe(42);
        expect(parseResourceId(42)).toBe(42);
        expect(resourceIdColumn(id)).toBe("public_id");
        expect(resourceIdColumn("42")).toBe("id");
    });

    it.each([0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1, "", "01", "1e3", "1 OR 1=1", "42 ", null, undefined, {}, "11111111-1111-4111-8111-111111111111"])("rejects invalid reference %s", (value) => {
        expect(() => parseResourceId(value)).toThrowError(expect.objectContaining({ statusCode: 400 }));
    });
});
