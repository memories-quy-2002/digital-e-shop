import { describe, expect, it } from "vitest";
import { getSafeRedirectTarget } from "./authRedirect";

describe("getSafeRedirectTarget", () => {
    it.each([
        [null, null],
        ["/admin", "/admin"],
        ["/admin/orders?status=pending", "/admin/orders?status=pending"],
        ["/admin/orders#pending", "/admin/orders#pending"],
        ["https://example.com", null],
        ["//example.com", null],
        ["/\\evil.com", null],
        ["/admin/orders" + "\n" + "?status=pending", null],
    ])("returns %s as %s", (value, expected) => {
        expect(getSafeRedirectTarget(value)).toBe(expected);
    });
});
