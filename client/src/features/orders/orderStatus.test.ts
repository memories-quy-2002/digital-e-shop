import { describe, expect, it } from "vitest";
import { getOrderStatusKey } from "./orderStatus";

describe("getOrderStatusKey", () => {
    it("uses the shared pending, done, and canceled mapping", () => {
        expect(getOrderStatusKey(0)).toBe("pending");
        expect(getOrderStatusKey(1)).toBe("done");
        expect(getOrderStatusKey(2)).toBe("canceled");
    });

    it("does not silently present an unknown status as pending", () => {
        expect(getOrderStatusKey(99)).toBe("unknown");
    });
});
