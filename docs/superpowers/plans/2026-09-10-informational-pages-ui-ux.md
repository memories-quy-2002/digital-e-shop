# Informational Pages UI/UX Remediation Plan

> Execute this plan with the subagent-driven-development workflow. Use a fresh implementer for each task, then a separate review pass. Implementers must not commit; preserve the four pre-existing unrelated dirty files.

## Shared constraints

- Branch: `feature/informational-pages-ui-ux`.
- Frontend ownership only; do not edit server files.
- Keep `POST /api/support/tickets` and the existing auth/CSRF contract unchanged.
- Use the existing `useT`, `useLocale`, `useAuth`, `createSupportTicket`, router, SCSS, and Testing Library patterns.
- Use `gpt-5.6-luna` for every implementer and reviewer.
- Do not stage or modify `Wiki/log.md`, `docs/DEVELOPMENT.md`, `server/README.prisma.md`, or `server/prisma.config.ts`.

## Task 1 — Contact guest flow and direct channels

### Files

- Modify `client/src/pages/ContactUsPage.tsx`.
- Modify the Contact dictionary sections in `client/src/i18n/en.ts` and `client/src/i18n/vi.ts`.
- Extend `client/src/pages/__tests__/ContactUsPage.test.tsx` or add a focused sibling test.

### Steps

1. Add failing tests for: anonymous submit redirects to `/login?redirect=%2Fcontact-us` without calling `createSupportTicket`; a valid session-storage draft is restored on mount; success clears the draft; email and phone render as `mailto:`/`tel:` links; pending/error copy comes from the dictionary.
2. Use `useAuth` to branch before calling `createSupportTicket`. For a guest, serialize only `name`, `email`, and `message` to a versioned session-storage key, toast a localized sign-in explanation, and navigate with the existing safe redirect convention. Handle storage failures without blocking navigation.
3. Restore and validate the draft once on mount. Clear it after a successful authenticated submission. Keep the existing API payload and success behavior.
4. Add localized placeholders, pending text, and guest/error text. Convert the direct email and phone values into accessible links while retaining the existing visual structure.
5. Run the focused Contact tests and client typecheck.

### Review gate

Check that guest requests cannot reach the protected API, redirect targets are same-origin, malformed storage is ignored, and existing authenticated submission remains unchanged.

## Task 2 — Support localization, links, and FAQ semantics

### Files

- Modify `client/src/pages/SupportPage.tsx`.
- Modify `client/src/i18n/en.ts` and `client/src/i18n/vi.ts` with matching `support` keys.
- Modify `client/src/styles/pages/_support.scss` only where needed for link affordances/focus or semantic markup.
- Add `client/src/pages/__tests__/SupportPage.test.tsx`.

### Steps

1. Add failing tests for localized hero/channel/resource/FAQ copy, the truthful Contact form channel, actionable resource links, and FAQ `aria-expanded`/`aria-controls` plus answer region semantics.
2. Move all Support user-facing strings into matching English/Vietnamese dictionary structures and read them through `useT`; localize Helmet metadata as well.
3. Keep channel destinations, but label the current `/contact-us` destination as a contact form. Use normal anchors for `mailto:`/`tel:` and `Link` for internal routes.
4. Map resources to `/orders` or `/contact-us`, provide visible CTA text, and preserve card layout.
5. Keep one FAQ open at a time, but render a text/span control plus an external answer region with stable IDs and correct ARIA relationships. Do not put a `<div>` inside a button.
6. Run focused Support tests and client typecheck.

### Review gate

Check every English string is gone from the Support component, all actions match their destination, keyboard focus remains visible, and the FAQ is understandable with assistive technology.

## Task 3 — News reading paths and locale dates

### Files

- Modify `client/src/pages/NewsPage.tsx`.
- Add a small shared static article mapping/data helper under `client/src/pages/` if needed.
- Add `client/src/pages/NewsArticlePage.tsx`.
- Modify `client/src/routes/router.tsx`.
- Modify the `news` dictionary sections in `client/src/i18n/en.ts` and `client/src/i18n/vi.ts` for slugs/body/CTA/detail copy.
- Modify `client/src/styles/pages/_news.scss` for CTA/detail styling.
- Add focused News page/detail tests.

### Steps

1. Add failing tests for visible article links, stable slugs, locale-aware dates, detail rendering, back navigation, and invalid slug handling.
2. Create a typed static mapping that keeps the existing featured story and four localized articles aligned by stable slugs, dates, authors, tags, read times, and body copy. Do not duplicate story identity in several components.
3. Add `/news/:slug` after `/news` in the router and render a responsive detail page using the existing Layout/Helmet/image conventions. Use the existing NotFoundPage for unknown slugs.
4. Add localized Read article/back labels and a clear CTA on the featured story and every card. Preserve the existing card surface and hover/focus style.
5. Format dates with `Intl.DateTimeFormat` from the active locale (`en-GB`/`vi-VN`) and a stable date input.
6. Run focused News tests and client typecheck.

### Review gate

Check that every CTA resolves to its own story, invalid URLs do not show the first story by fallback, dates are not hardcoded to English, and the detail route works at desktop and mobile widths.

## Final verification

1. Run all relevant client checks: typecheck, focused tests, full client tests, build, and lint; record any environment-specific failures.
2. Start the client dev server and use Playwright CLI at exactly 1920x1080, then a mobile viewport, to verify Contact/Support/News and one detail route. Capture screenshots and confirm no horizontal overflow, visible focus, truthful labels, and correct guest Contact redirect behavior.
3. Re-read the diff, confirm only intended frontend/docs plan files changed, and report remaining risks without committing or pushing.
