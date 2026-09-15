import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) =>
    readFileSync(path.resolve(process.cwd(), relativePath), "utf8");

const sharedStyles = read("src/styles/pages/_informational.scss");
const pageSources = {
    about: read("src/pages/AboutUsPage.tsx"),
    news: read("src/pages/NewsPage.tsx"),
    contact: read("src/pages/ContactUsPage.tsx"),
    support: read("src/pages/SupportPage.tsx"),
};

describe("informational full-bleed Hero contract", () => {
    it("defines one compact tokenized Hero image system", () => {
        expect(sharedStyles).toContain("&__hero {");
        expect(sharedStyles).toContain("--info-hero-height: clamp(340px, 36vw, 440px);");
           expect(sharedStyles).toContain("object-fit: cover;");
           expect(sharedStyles).toContain("align-content: end;");
           expect(sharedStyles).toContain("border-radius: var(--de-radius-lg);");
           expect(sharedStyles).toContain("backdrop-filter: blur(14px);");
           expect(sharedStyles).toContain("color-mix(in srgb, var(--info-hero) 96%, transparent)");
           expect(sharedStyles).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));");
           expect(sharedStyles).not.toMatch(/min-height:\s*(470|520)px/);
    });

    it("connects each page to the shared Hero and selected asset", () => {
        expect(pageSources.about).toContain('className="about__hero info-page__hero"');
        expect(pageSources.news).toContain('className="news__hero info-page__hero"');
        expect(pageSources.contact).toContain('className="contact__hero info-page__hero"');
        expect(pageSources.support).toContain('className="support__hero info-page__hero"');
        expect(pageSources.about).toContain('className="info-page__hero__image"');
        expect(pageSources.news).toContain('className="info-page__hero__image"');
        expect(pageSources.contact).toContain("background_form.jpg");
        expect(pageSources.support).toContain('className="info-page__hero__image"');
    });
});
