import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(path.resolve(process.cwd(), "src/styles/features/orders/_checkout-success.scss"), "utf8");

describe("Checkout Success theme contract", () => {
    it("keeps surfaces and accents on the shared theme token system", () => {
        expect(stylesheet).toContain("var(--de-color-surface-inverse)");
        expect(stylesheet).toContain("var(--de-color-info-soft)");
        expect(stylesheet).toContain("var(--de-gradient-success)");
        expect(stylesheet).not.toMatch(/#[0-9a-f]{3,8}/i);
        expect(stylesheet).not.toMatch(/rgba?\(/i);
    });
});
