import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(
    path.resolve(process.cwd(), "src/styles/pages/_home.scss"),
    "utf8",
).replace(/\r\n/g, "\n");

describe("HomePage reference theme", () => {
    it("keeps the trending shelf full-width and cards aligned across themes", () => {
        expect(stylesheet).toContain("    &__shelf__content {\n        display: block;\n    }");
        expect(stylesheet).toContain(
            '[data-testid="product-card"] {\n            display: flex;\n            height: 100%;\n            min-height: 410px;',
        );
        expect(stylesheet).toContain(
            "--home-surface: var(--de-color-surface);",
        );
        expect(stylesheet).toContain(
            "--home-surface-soft: var(--de-color-surface-muted);",
        );
        expect(stylesheet).not.toContain("--home-surface: #fffdf8;");
        expect(stylesheet).not.toContain("--home-surface: #18262d;");
    });
    it("keeps the value section on semantic theme tokens", () => {
        expect(stylesheet).toContain(
            "    &__value {\n        border-block: 1px solid var(--home-line);",
        );
        expect(stylesheet).toContain("--home-bg: var(--de-color-bg);");
        expect(stylesheet).toContain("--home-hero: var(--de-color-bg-muted);");
    });
});
