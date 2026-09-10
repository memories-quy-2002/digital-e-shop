import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(path.resolve(process.cwd(), "src/styles/pages/_support.scss"), "utf8");

describe("SupportPage theme", () => {
    it("uses theme-aware accent tokens for channel action buttons", () => {
        const channelStyles = stylesheet.slice(
            stylesheet.indexOf("&__channels__card"),
            stylesheet.indexOf("&__faq__list"),
        );

        expect(channelStyles).toContain("background: var(--de-color-signal);");
        expect(channelStyles).toContain("color: var(--de-color-on-accent);");
        expect(channelStyles).not.toContain("background: var(--info-ink);");
    });
});
