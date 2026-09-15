# Informational Pages Full-Bleed Hero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Convert About, News, Contact, and Support to one compact full-bleed image Hero system while preserving their content, routes, behavior, and responsive accessibility.

**Architecture:** Keep the existing four page components and BEM SCSS files. Add a shared Hero contract under \`client/src/styles/pages/_informational.scss\`; page styles provide only image focal position, content width, and optional rail layout. Reuse existing responsive image helpers and assets, with no new React abstraction or dependency.

**Tech Stack:** React 19, TypeScript, Vite, SCSS, existing \`--de-*\` theme tokens, Vitest, Testing Library, and Playwright CLI/browser verification.

## Global Constraints

- Use the existing Digital-E Workbench / Signal visual identity and semantic \`--de-*\` tokens.
- Reuse \`about_us.jpg\`, \`news_2.jpg\`, \`background_form.jpg\`, and \`support.jpg\`; do not add or generate an image asset.
- Preserve the current copy, routes, localized dictionaries, support-ticket behavior, and News detail route.
- Keep Hero images decorative with \`alt=""\` and \`aria-hidden="true"\`; preserve responsive \`srcSet\` handling.
- Target a compact Hero of roughly \`clamp(340px, 36vw, 440px)\` on larger screens and content-driven sizing on small screens.
- Do not retain the previous 470–520px minimum-height behavior for Contact or Support.
- Use token-derived overlays and borders; do not add page-specific hard-coded theme colors.
- Do not add dependencies, change the backend, implement a News API/CMS/live feed, or redesign unrelated storefront/admin pages.
- Do not stage or modify existing auth, content, server, or Wiki worktree changes unless a later task explicitly owns a hunk in one of those files.
- Use the current branch/worktree; do not create a worktree, reset files, rebase, or push.

## File Map

- Create \`client/src/pages/InformationalHeroTheme.test.ts\`: static contract coverage for the shared Hero selectors, compact sizing, image layer, and page-to-asset/class wiring.
- Modify \`client/src/styles/pages/_informational.scss\`: common Hero image/overlay/content/rail/action rules and shared surface rhythm.
- Modify \`client/src/pages/AboutUsPage.tsx\`: move the existing About image into the shared full-bleed Hero layer and use Hero image widths.
- Modify \`client/src/styles/pages/_about.scss\`: remove split-Hero sizing and retain only About-specific crop, copy, and lower-page card rules.
- Modify \`client/src/pages/NewsPage.tsx\`: add the shared Hero contract to the existing News image, copy, and ticker.
- Modify \`client/src/styles/pages/_news.scss\`: remove duplicated Hero image/overlay rules and align News ticker/cards with the shared system.
- Modify \`client/src/pages/ContactUsPage.tsx\`: import \`background_form.jpg\`, add its responsive decorative image layer, and mark stats as the optional Hero rail.
- Modify \`client/src/styles/pages/_contact.scss\`: replace the gradient Hero with the shared image Hero and keep Contact-specific stats/form layout.
- Modify \`client/src/pages/SupportPage.tsx\`: wrap existing Hero copy and attach the shared image/content classes.
- Modify \`client/src/styles/pages/_support.scss\`: remove duplicated image/overlay/min-height rules and retain Support-specific crop/actions/card layout.

---

### Task 1: Add the shared Hero contract and regression test

**Files:**
- Create: \`client/src/pages/InformationalHeroTheme.test.ts\`
- Modify: \`client/src/styles/pages/_informational.scss\`

**Interfaces:**
- Consumes: the existing \`.info-page\`, \`.info-page__actions\`, \`.info-page__surface\`, and \`.info-page__panel\` SCSS selectors.
- Produces: the \`.info-page__hero\`, \`.info-page__hero__image\`, \`.info-page__hero__content\`, and \`.info-page__hero__rail\` class contract consumed by all four page components.

- [ ] **Step 1: Write the failing shared-contract test**

Create \`client/src/pages/InformationalHeroTheme.test.ts\` with this coverage:

~~~ts
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
        expect(sharedStyles).toContain("min-height: clamp(340px, 36vw, 440px);");
        expect(sharedStyles).toContain("object-fit: cover;");
        expect(sharedStyles).toContain("align-content: end;");
        expect(sharedStyles).toContain("border-radius: var(--de-radius-lg);");
        expect(sharedStyles).toContain("color-mix(in srgb, var(--info-hero) 94%, transparent)");
        expect(sharedStyles).not.toMatch(/min-height:\s*(470|520)px/);
    });

    it("connects each page to the shared Hero and selected asset", () => {
        expect(pageSources.about).toContain('className="about__hero info-page__hero"');
        expect(pageSources.news).toContain('className="news__hero info-page__hero"');
        expect(pageSources.contact).toContain('className="contact__hero info-page__hero"');
        expect(pageSources.support).toContain('className="support__hero info-page__hero"');
        expect(pageSources.about).toContain('className="info-page__hero__image"');
        expect(pageSources.news).toContain('className="info-page__hero__image"');
        expect(pageSources.contact).toContain('background_form.jpg');
        expect(pageSources.support).toContain('className="info-page__hero__image"');
    });
});
~~~

- [ ] **Step 2: Run the contract test and verify it fails for the missing contract**

Run:

~~~powershell
pnpm --dir client exec vitest run src/pages/InformationalHeroTheme.test.ts
~~~

Expected: FAIL because the current shared stylesheet has no compact Hero contract and the page components do not yet use the shared Hero class.

- [ ] **Step 3: Add the shared image Hero rules**

Extend \`client/src/styles/pages/_informational.scss\` inside \`.info-page\` with the following rules, while preserving the existing section-heading/action/surface selectors:

~~~scss
    --info-hero-height: clamp(340px, 36vw, 440px);

    &__hero {
        position: relative;
        display: grid;
        min-height: var(--info-hero-height);
        align-content: end;
        overflow: hidden;
        isolation: isolate;
        border: 1px solid var(--info-hero-border);
        border-radius: var(--de-radius-lg);
        background: var(--info-hero);
        color: var(--info-hero-text);
    }

    &__hero::before {
        position: absolute;
        z-index: 1;
        inset: 0;
        background:
            linear-gradient(
                90deg,
                color-mix(in srgb, var(--info-hero) 94%, transparent) 0%,
                color-mix(in srgb, var(--info-hero) 76%, transparent) 44%,
                color-mix(in srgb, var(--info-hero) 36%, transparent) 80%,
                transparent 100%
            );
        content: "";
        pointer-events: none;
    }

    &__hero::after {
        position: absolute;
        z-index: 1;
        inset: 0;
        background:
            radial-gradient(
                circle at 88% 18%,
                color-mix(in srgb, var(--de-color-electric) 22%, transparent),
                transparent 36%
            ),
            linear-gradient(
                180deg,
                transparent 40%,
                color-mix(in srgb, var(--info-hero) 64%, transparent) 100%
            );
        content: "";
        pointer-events: none;
    }

    &__hero__image {
        position: absolute;
        z-index: 0;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        opacity: 0.78;
    }

    &__hero > *:not(.info-page__hero__image) {
        position: relative;
        z-index: 2;
    }

    &__hero__content {
        align-self: end;
        width: 100%;
        max-width: 820px;
        padding: clamp(1.5rem, 5vw, 3.5rem);
    }

    &__hero__rail {
        position: relative;
        z-index: 2;
    }

    &__hero .info-page__actions .ghost {
        border-color: var(--info-hero-border);
        background: color-mix(in srgb, var(--info-hero-text) 10%, transparent);
        color: var(--info-hero-text);
    }

    &__hero .info-page__actions .ghost:hover {
        border-color: var(--de-color-electric);
        color: var(--info-hero-text);
    }

    @media (max-width: 640px) {
        &__hero {
            min-height: 0;
        }

        &__hero__content {
            padding: 1.35rem;
        }
    }
~~~

Update the existing \`.info-page__surface, .info-page__panel\` rule to use \`var(--de-radius-md)\` and \`var(--de-shadow-sm)\`, keeping its semantic border/background tokens. Keep \`.info-page__actions\` at a minimum 44px control height.

- [ ] **Step 4: Run the shared-contract test and isolate the expected wiring failure**

Run:

~~~powershell
pnpm --dir client exec vitest run src/pages/InformationalHeroTheme.test.ts
~~~

Expected: the first test passes and the second test fails only because the page wiring is deliberately scheduled in Tasks 2 and 3. Re-run the complete contract test after those tasks; do not treat the expected second failure as a finished implementation.

- [ ] **Step 5: Commit only the isolated shared-contract files**

Review \`git diff -- client/src/styles/pages/_informational.scss client/src/pages/InformationalHeroTheme.test.ts\`. Stage only those two paths and commit:

~~~powershell
git add -- client/src/styles/pages/_informational.scss client/src/pages/InformationalHeroTheme.test.ts
git diff --cached --check
git diff --cached --name-only
git commit -m "feat(ui): add shared informational hero contract"
~~~

Expected: the staged-name check lists only the two Task 1 files. Do not stage any existing dirty page, content, auth, server, or Wiki file.

---

### Task 2: Convert About and News to the full-bleed Hero

**Files:**
- Modify: \`client/src/pages/AboutUsPage.tsx\`
- Modify: \`client/src/styles/pages/_about.scss\`
- Modify: \`client/src/pages/NewsPage.tsx\`
- Modify: \`client/src/styles/pages/_news.scss\`

**Interfaces:**
- Consumes: Task 1 shared Hero classes and existing \`getResponsiveImageSource\`/translation APIs.
- Produces: About and News Hero markup with the same image/content contract, while preserving feature image, ticker, article links, and all existing page copy.

- [ ] **Step 1: Update About image sizing and Hero markup**

Change the About image helper import to include \`HERO_IMAGE_WIDTHS\`:

~~~tsx
import { HERO_IMAGE_WIDTHS, getResponsiveImageSource } from "../utils/images";
~~~

Use \`HERO_IMAGE_WIDTHS\` and \`sizes: "100vw"\` for \`heroImageSource\`. Replace the current split Hero with:

~~~tsx
<section className="about__hero info-page__hero">
    <img
        className="info-page__hero__image"
        src={heroImageSource.src}
        srcSet={heroImageSource.srcSet}
        sizes={heroImageSource.sizes}
        alt=""
        aria-hidden="true"
        loading="eager"
        fetchPriority="high"
        decoding="async"
    />
    <div className="about__hero__content info-page__hero__content">
        <h1>{t("about.title")}</h1>
        <p>{t("about.subtitle")}</p>
        <div className="about__hero__actions info-page__actions">
            <Link to="/shops">{t("about.explore")}</Link>
            <Link to="/support" className="ghost">
                {t("about.getSupport")}
            </Link>
        </div>
    </div>
</section>
~~~

Remove the old \`about__hero__media\` wrapper and its image; do not alter the stats, values, story, team, or dictionary usage.

- [ ] **Step 2: Remove About split-Hero sizing and align About surfaces**

In \`_about.scss\`, remove the \`grid-template-columns\`, 520px minimum-height, \`about__hero__media\`, and media overlay rules. Keep the About copy selectors and add:

~~~scss
    &__hero {
        grid-template-columns: minmax(0, 1fr);

        .info-page__hero__image {
            object-position: 50% 44%;
        }

        &__content {
            max-width: 820px;
        }
    }
~~~

Change About stats, value/team cards, story content, and milestone cards from literal 18px/24px radii to \`var(--de-radius-md)\` or \`var(--de-radius-lg)\` according to their existing size hierarchy. Keep their existing tokenized backgrounds, text colors, and shadows.

- [ ] **Step 3: Add the shared Hero classes to News**

Update the News Hero opening and image/content/rail classes:

~~~tsx
<header className="news__hero info-page__hero">
    <img
        className="info-page__hero__image"
        src={heroImageSource.src}
        srcSet={heroImageSource.srcSet}
        sizes={heroImageSource.sizes}
        alt=""
        aria-hidden="true"
        loading="eager"
        fetchPriority="high"
        decoding="async"
    />
    <div className="news__hero__content info-page__hero__content">
        <h1>{t("news.title")}</h1>
        <p>{t("news.subtitle")}</p>
        <div className="news__hero__actions info-page__actions">
            <Link to="/shops">{t("news.browseNewArrivals")}</Link>
            <Link to="/support" className="ghost">
                {t("news.visitSupport")}
            </Link>
        </div>
    </div>
    <div className="news__hero__ticker info-page__hero__rail" aria-label={t("news.tickerAria")}>
        {briefs.map((brief) => (
            <span key={brief}>{brief}</span>
        ))}
    </div>
</header>
~~~

Keep \`featureImageSource\`, the featured article section, stable slugs, localized date formatting, and article links unchanged.

- [ ] **Step 4: Reduce News Hero duplication and align ticker/cards**

In \`_news.scss\`, remove News-specific \`min-height: 520px\`, background, color, pseudo-overlay, and direct-image positioning rules now owned by \`_informational.scss\). Keep:

~~~scss
    &__hero {
        grid-template-columns: minmax(0, 1fr);

        .info-page__hero__image {
            object-position: 55% 50%;
        }

        &__ticker {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 0.6rem;
            padding: 0 clamp(1.35rem, 5vw, 3.5rem) clamp(1.35rem, 4vw, 2.5rem);
        }
    }

    @media (max-width: 859px) {
        &__hero__ticker {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }
~~~

Use semantic radius tokens for the News ticker, featured surface, and article cards while keeping the existing content hierarchy and focus-visible link style.

- [ ] **Step 5: Run About/News focused tests**

Run:

~~~powershell
pnpm --dir client exec vitest run src/pages/__tests__/AboutUsPage.test.tsx src/pages/__tests__/NewsPage.test.tsx src/pages/InformationalHeroTheme.test.ts
~~~

Expected: About, News, and the shared Hero contract tests pass; there are no route, article-link, locale-date, or copy regressions.

- [ ] **Step 6: Review and stage only the visual Hero hunks**

Because AboutUsPage.tsx and NewsPage.tsx already contain unrelated dirty content changes, inspect their diffs before staging:

~~~powershell
git diff -- client/src/pages/AboutUsPage.tsx client/src/pages/NewsPage.tsx client/src/styles/pages/_about.scss client/src/styles/pages/_news.scss
~~~

Stage only the full-bleed Hero hunks from the two page components plus the two SCSS files. Do not stage existing content/localization hunks. Verify with \`git diff --cached\` before using a Conventional Commit:

~~~powershell
git diff --cached --check
git diff --cached --stat
~~~

If a component file cannot be safely split without bundling its pre-existing copy edits, leave the Task 2 changes uncommitted and report that exact staging boundary instead of staging the whole file.

---

### Task 3: Convert Contact and Support to the full-bleed Hero

**Files:**
- Modify: \`client/src/pages/ContactUsPage.tsx\`
- Modify: \`client/src/styles/pages/_contact.scss\`
- Modify: \`client/src/pages/SupportPage.tsx\`
- Modify: \`client/src/styles/pages/_support.scss\`

**Interfaces:**
- Consumes: Task 1 shared Hero classes, existing Contact localization/auth/ticket flow, and existing Support image helper.
- Produces: compact Contact and Support Heroes with unchanged form submission, guest redirect, FAQ, channel, resource, and CTA behavior.

- [ ] **Step 1: Add Contact's existing background asset and responsive source**

Add the imports:

~~~tsx
import backgroundFormImage from "../assets/images/background_form.jpg";
import { HERO_IMAGE_WIDTHS, getResponsiveImageSource } from "../utils/images";
~~~

Create this source inside \`ContactUsPage\` before the return:

~~~tsx
const heroImageSource = getResponsiveImageSource(backgroundFormImage, {
    widths: HERO_IMAGE_WIDTHS,
    sizes: "100vw",
    fit: "fill",
});
~~~

Replace the current Contact Hero with:

~~~tsx
<section className="contact__hero info-page__hero">
    <img
        className="info-page__hero__image"
        src={heroImageSource.src}
        srcSet={heroImageSource.srcSet}
        sizes={heroImageSource.sizes}
        alt=""
        aria-hidden="true"
        loading="eager"
        fetchPriority="high"
        decoding="async"
    />
    <div className="contact__hero__content info-page__hero__content">
        <h1>{t("contact.title")}</h1>
        <p>{t("contact.subtitle")}</p>
        <div className="info-page__actions">
            <Link to="/support">{t("contact.visitSupport")}</Link>
            <Link to="/orders" className="ghost contact__hero__action--ghost">
                {t("contact.reviewOrders")}
            </Link>
        </div>
    </div>
    <div className="contact__hero__stats info-page__hero__rail">
        <article>
            <span>{t("contact.stats.responseLabel")}</span>
            <strong>{t("contact.stats.responseValue")}</strong>
        </article>
        <article>
            <span>{t("contact.stats.coverageLabel")}</span>
            <strong>{t("contact.stats.coverageValue")}</strong>
        </article>
        <article>
            <span>{t("contact.stats.channelsLabel")}</span>
            <strong>{t("contact.stats.channelsValue")}</strong>
        </article>
    </div>
</section>
~~~

Do not alter \`handleSubmit\`, \`CONTACT_DRAFT_KEY\`, the loading branch, direct contact links, form fields, or localized keys.

- [ ] **Step 2: Replace Contact's gradient Hero rules with the shared image layout**

In \`_contact.scss\`, remove the current Contact Hero gradient, 2rem/3rem Hero padding, 28px radius, and standalone shadow. Keep the desktop two-column relationship using:

~~~scss
    &__hero {
        grid-template-columns: minmax(0, 1.12fr) minmax(280px, 0.88fr);
        align-items: end;

        .info-page__hero__image {
            object-position: 62% 48%;
        }
    }

    &__hero__content {
        max-width: 760px;
    }

    &__hero__stats {
        display: grid;
        align-self: end;
        gap: 0.6rem;
        padding: 0 clamp(1.35rem, 4vw, 3.5rem) clamp(1.35rem, 4vw, 3.5rem) 0;
    }

    @media (max-width: 979px) {
        &__hero {
            grid-template-columns: minmax(0, 1fr);
        }

        &__hero__stats {
            grid-template-columns: repeat(3, minmax(0, 1fr));
            padding: 0 1.35rem 1.35rem;
        }
    }

    @media (max-width: 640px) {
        &__hero__stats {
            grid-template-columns: 1fr;
        }
    }
~~~

Keep the existing glass stat cards but replace literal 18px radius with \`var(--de-radius-md)\`; use the shared Hero ghost action rule instead of a second color treatment.

- [ ] **Step 3: Wrap Support copy and attach the shared Hero contract**

Update the Support Hero to:

~~~tsx
<header className="support__hero info-page__hero">
    <img
        className="info-page__hero__image"
        src={heroImageSource.src}
        srcSet={heroImageSource.srcSet}
        sizes={heroImageSource.sizes}
        alt=""
        aria-hidden="true"
        loading="eager"
        fetchPriority="high"
        decoding="async"
    />
    <div className="support__hero__content info-page__hero__content">
        <h1>{t("support.title")}</h1>
        <p>{t("support.heroSubtitle")}</p>
        <div className="support__hero__actions info-page__actions">
            <Link to="/orders">{t("support.viewOrderHistory")}</Link>
            <Link to="/contact-us" className="ghost">
                {t("support.contactUs")}
            </Link>
        </div>
    </div>
</header>
~~~

Leave \`channels\`, \`resources\`, FAQ state/ARIA, and all Support dictionary calls unchanged.

- [ ] **Step 4: Remove duplicated Support overlay/min-height rules**

In \`_support.scss\`, remove the current standalone \`::before\`, direct image selector, \`min-height: 470px\`, desktop 4rem padding, and standalone Hero background/color declarations. Keep:

~~~scss
   &__hero {
       grid-template-columns: minmax(0, 1fr);

        .info-page__hero__image {
           object-position: 50% 50%;
       }

        &__content {
            max-width: 780px;
        }
    }

    @media (max-width: 520px) {
        &__hero__actions {
            align-items: stretch;
            flex-direction: column;
        }
    }
~~~

Use \`var(--de-radius-md)\` for Support channel/resource/FAQ cards and preserve the current tokenized focus-visible states. Remove the old 420px mobile minimum-height so mobile sizing follows the shared content-driven Hero.

- [ ] **Step 5: Run Contact/Support focused tests**

Run:

~~~powershell
pnpm --dir client exec vitest run src/pages/__tests__/ContactUsPage.test.tsx src/pages/__tests__/SupportPage.test.tsx src/pages/InformationalHeroTheme.test.ts
~~~

Expected: Contact guest/authenticated behavior, direct links, localization, Support actions/FAQ semantics, and the shared Hero contract all pass.

- [ ] **Step 6: Review and stage only the visual Hero hunks**

ContactUsPage.tsx already contains unrelated dirty content/flow changes. Inspect:

~~~powershell
git diff -- client/src/pages/ContactUsPage.tsx client/src/pages/SupportPage.tsx client/src/styles/pages/_contact.scss client/src/styles/pages/_support.scss
~~~

Stage only the Contact Hero image/class hunk plus the complete Support and SCSS Hero changes. Verify:

~~~powershell
git diff --cached --check
git diff --cached --name-only
~~~

Do not stage the existing Contact auth/draft/content hunks. If selective staging cannot isolate them, leave the Task 3 implementation uncommitted rather than bundling unrelated work.

---

### Task 4: Run full verification and visual handoff

**Files:**
- Modify: none unless a verification failure identifies a direct Hero regression.
- Inspect: all four page components and four page SCSS files.
- Artifacts: \`output/playwright/informational-pages-full-bleed-desktop.png\` and \`output/playwright/informational-pages-full-bleed-mobile.png\`.

**Interfaces:**
- Consumes: the completed shared Hero contract and page-specific implementations from Tasks 1–3.
- Produces: verified responsive pages with no route/API/content behavior changes.

- [ ] **Step 1: Run the complete focused informational suite**

Run:

~~~powershell
pnpm --dir client exec vitest run src/pages/InformationalHeroTheme.test.ts src/pages/__tests__/AboutUsPage.test.tsx src/pages/__tests__/ContactUsPage.test.tsx src/pages/__tests__/NewsPage.test.tsx src/pages/__tests__/SupportPage.test.tsx
~~~

Expected: exit code 0 with no failed tests.

- [ ] **Step 2: Run client typecheck and build**

Run:

~~~powershell
pnpm --dir client exec tsc -p tsconfig.json --noEmit
pnpm --dir client build
~~~

Expected: both commands exit 0; the build emits the normal Vite production bundle.

- [ ] **Step 3: Run client lint and full test suite**

Run:

~~~powershell
pnpm --dir client lint
pnpm --dir client test -- --run
~~~

Expected: exit code 0. Existing \`no-explicit-any\` warnings may remain, but no new lint error should be introduced by the Hero pass.

- [ ] **Step 4: Verify routes in a real browser at desktop and mobile widths**

Start the independent client dev server:

~~~powershell
pnpm --dir client dev --host 127.0.0.1
~~~

At 1440×900 and 375×812, inspect \`/about-us\`, \`/news\`, \`/contact-us\`, and \`/support\`. Confirm:

- every Hero uses the shared full-bleed image surface and correct asset;
- Contact and Support no longer contain dead vertical space around copy;
- overlay contrast keeps headings, body copy, ghost actions, and rail text readable;
- image focal positions keep the important subject visible;
- CTA focus rings remain visible;
- ticker and Contact stats wrap without horizontal overflow;
- the existing News links, Contact form, Support FAQ, and localized copy still behave as before.

Capture the desktop and mobile comparison screenshots at the artifact paths listed above.

- [ ] **Step 5: Review the final diff and dirty-worktree boundary**

Run:

~~~powershell
git diff --check
git status --short --branch
git diff --stat
~~~

Confirm that only the intended Hero/style/test hunks were added by this pass and that existing auth, content, server, and Wiki changes remain present and uncommitted unless they were explicitly isolated into a separate prior commit. Report any command that could not run and why.
