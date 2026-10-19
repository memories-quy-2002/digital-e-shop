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
            "--de-color-focus: #2768cf;",
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

        expect(headerStyles).toContain("background: color-mix(in srgb, var(--de-color-chrome) 96%, transparent);");
        expect(headerStyles).toContain("color: var(--de-color-on-accent);");
        expect(headerStyles).not.toContain("color: var(--de-color-bg);");
    });

    it("keeps delivery quote results readable in both themes", () => {
        const shippingStyles = readStylesheet("src/styles/features/shipping/_shipping.scss");
        const resultStyles = shippingStyles.match(/\.shipping-quote__result\s*\{[^}]+\}/)?.[0] ?? "";
        const resultMetaStyles = shippingStyles.match(/\.shipping-quote__result small, \.shipping-quote__hint\s*\{[^}]+\}/)?.[0] ?? "";

        expect(resultStyles).toContain("background: var(--de-color-surface-muted);");
        expect(resultStyles).toContain("color: var(--de-color-text);");
        expect(resultStyles).toContain("border: 1px solid var(--de-color-border);");
        expect(resultStyles).not.toContain("--de-color-subtle");
        expect(resultMetaStyles).toContain("var(--de-color-text-muted)");
        expect(resultMetaStyles).not.toContain("--de-color-muted");
    });

    it("keeps keyboard focus visible with a theme-aware outline", () => {
        const darkTheme = themeStylesheet.slice(0, themeStylesheet.indexOf(':root[data-theme="light"]'));

        expect(darkTheme).toContain("--de-color-focus: #79b7ff;");
        expect(themeStylesheet).toContain("--de-color-focus: #2768cf;");
        expect(themeStylesheet).toContain("outline: 2px solid var(--de-color-focus);");
        expect(themeStylesheet).toContain("@media (prefers-reduced-motion: reduce)");
    });

    it("defines shared motion durations, easing, and reduced-motion delays", () => {
        expect(themeStylesheet).toContain("--de-duration-fast: 160ms;");
        expect(themeStylesheet).toContain("--de-duration-base: 240ms;");
        expect(themeStylesheet).toContain("--de-duration-slow: 360ms;");
        expect(themeStylesheet).toContain("--de-duration-spinner: 700ms;");
        expect(themeStylesheet).toContain("--de-duration-skeleton: 1.35s;");
        expect(themeStylesheet).toContain("--de-ease-standard: cubic-bezier(0.2, 0, 0, 1);");
        expect(themeStylesheet).toContain("--de-transition-fast: var(--de-duration-fast) var(--de-ease-standard);");
        expect(themeStylesheet).toContain("--de-transition-enter: var(--de-duration-base) var(--de-ease-enter);");
        expect(themeStylesheet).toContain("transition-delay: 0ms !important;");
        expect(themeStylesheet).toContain("animation-delay: 0.01ms !important;");
    });
});
