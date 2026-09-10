import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const readStylesheet = (relativePath: string) => readFileSync(path.resolve(process.cwd(), relativePath), "utf8");

const themeStylesheet = readStylesheet("src/styles/tailwind.css");

describe("shared theme token contract", () => {
    it("defines the complete Light chrome and state palette", () => {
        const lightTheme = themeStylesheet.slice(themeStylesheet.indexOf(':root[data-theme="light"]'), themeStylesheet.indexOf("\n}\n\n*,"));

        [
            "--de-color-chrome: #f5f2eb;",
            "--de-color-chrome-surface: #ffffff;",
            "--de-color-chrome-text: #1a2123;",
            "--de-color-chrome-muted: #657171;",
            "--de-color-chrome-border: rgba(17, 20, 22, 0.14);",
            "--de-color-signal-hover: #a83f29;",
            "--de-color-circuit-hover: #6b8c21;",
            "--de-color-warning: #b26f16;",
            "--de-color-warning-soft: rgba(178, 111, 22, 0.14);",
            "--de-color-primary-soft: rgba(82, 108, 24, 0.16);",
            "--de-color-primary-tint: rgba(82, 108, 24, 0.08);",
            "--de-color-grid: rgba(26, 33, 35, 0.045);",
            "--de-color-selection: rgba(195, 75, 43, 0.22);",
        ].forEach((token) => expect(lightTheme).toContain(token));
    });

    it("keeps shared page surfaces on semantic theme tokens", () => {
        const activeThemeStyles = [
            "src/styles/layout/_header.scss",
            "src/styles/layout/_footer.scss",
            "src/styles/layout/_admin-shell.scss",
            "src/styles/features/admin/_shell.scss",
            "src/styles/features/admin/_dashboard.scss",
            "src/styles/features/admin/_notifications.scss",
            "src/styles/features/admin/_orders.scss",
            "src/styles/features/admin/_products.scss",
            "src/styles/features/admin/_accounts.scss",
            "src/styles/features/auth/_login.scss",
            "src/styles/features/auth/_signup.scss",
            "src/styles/features/orders/_cart.scss",
            "src/styles/features/orders/_guest-order.scss",
            "src/styles/pages/_contact.scss",
            "src/styles/pages/_not-found.scss",
            "src/styles/pages/_product.scss",
            "src/styles/pages/_shops.scss",
            "src/styles/pages/_support.scss",
        ];

        activeThemeStyles.forEach((relativePath) => {
            const stylesheet = readStylesheet(relativePath);
            expect(stylesheet, relativePath).not.toMatch(/#[0-9a-f]{3,8}/i);
            expect(stylesheet, relativePath).not.toMatch(/rgba?\(/i);
        });
    });

    it("binds the storefront header to the Light chrome tokens", () => {
        const headerStyles = readStylesheet("src/styles/layout/_header.scss");

        expect(headerStyles).toContain("background: color-mix(in srgb, var(--de-color-chrome) 94%, transparent);");
        expect(headerStyles).toContain("color: var(--de-color-on-accent);");
        expect(headerStyles).not.toContain("color: var(--de-color-bg);");
    });
});
