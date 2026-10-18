# Digital-E Ecommerce UI/UX Redesign

## Product brief

Improve the existing Digital-E storefront and admin experience so customers can discover electronics, compare products, understand purchase details, and complete existing tasks with less friction. Keep the site's warm technical-editorial identity and make its current patterns feel coherent across pages, themes, locales, and screen sizes.

## Baseline audit

### Evidence captured

- Browser: local Vite app at `http://127.0.0.1:5173`; screenshots are stored outside the repository at `C:/Users/Admin/AppData/Local/Temp/digital-e-ui-ux-redesign/`.
- Desktop viewport: 1440×1000. Mobile viewport: 390×844.
- Inspected routes: `/`, `/shops`, `/product?id=182`, `/cart`, `/login`, `/about-us`, `/contact-us`, `/news`, `/support`, `/compare`, `/wishlist`, and `/admin`.
- Screenshots captured for the homepage at desktop and mobile, catalog at desktop, product detail at desktop and mobile, and empty cart at mobile.
- The local product catalog returned 100 items. These are local runtime values and are not treated as production catalog claims.
- Three browser requests returned 401 while the visitor was unauthenticated. `/wishlist` and `/admin` correctly landed on `/login`; those pages could not be visually inspected as authenticated users in this baseline.
- No horizontal overflow appeared on the inspected routes at 390px. The app's normal document scrolling is expected.

### Findings

| Priority | Evidence | User impact | Direction |
| --- | --- | --- | --- |
| P1 | At 390×844, the product image and product identity fill the first viewport; quantity and the existing Add to cart control appear after scrolling. | The main purchase action is hard to reach while deciding on a product. | Test a compact mobile purchase action that calls the existing handler, stays clear of focused controls, and does not cover content. |
| P2 | The mobile storefront header stacks the identity/menu row and search row, using about 137px before page content begins. | Less product content is visible on small screens. | Tighten chrome spacing while keeping search, menu, theme, locale, account, and cart controls usable and labeled. |
| P2 | The catalog's 17 categories create a long desktop filter column, while product cards present technical specifications, ratings, price, stock, and actions together. | Browsing requires more scanning effort, especially on narrow screens. | Improve grouping, sticky/scroll behavior where appropriate, card hierarchy, and mobile filter apply/reset clarity without changing query behavior. |
| P2 | Home, catalog, and product detail each use the shared palette but differ in heading rhythm, surface density, and action hierarchy. | The transition between discovery and purchase feels less consistent than the individual screens. | Keep the editorial home and existing semantic colors; align spacing, typography, surfaces, and focus/interaction states across the journey. |
| P2 | The local baseline shows light theme only; the source supports light and dark themes and English and Vietnamese. | Dark theme and Vietnamese fit cannot be inferred from a light English screenshot. | Verify both themes and locales in browser after implementation. |
| P2 | Admin pages are role-protected and the unauthenticated baseline redirects to login. | Admin visual quality needs source and controlled-fixture review rather than a claim based on this visitor session. | Preserve the existing authorization boundary and use the repository's safe browser fixture for any admin visual checks. |

### Strengths to preserve

- A distinctive everyday-electronics editorial voice, clear homepage hero, category discovery, and product-led content.
- Existing English/Vietnamese localization and light/dark theme tokens.
- Explicit loading/error/empty states in catalog and customer flows.
- A semantic skip link, responsive search/navigation, comparison, wishlist, and accessible filter sheet patterns.
- Server-authoritative price, stock, payment, order, authentication, and admin authorization behavior.

## Visual direction

Use a **warm technical editorial** system: mineral/paper backgrounds, graphite text and dark surfaces, terracotta for the primary purchase action, olive for inventory/success states, and electric blue for secondary links and focus. Retain the existing Exo 2 display face and Nunito Sans body face; use the existing mono face only for small technical metadata. Use a restrained 4/8px spacing rhythm, clear heading scale, readable product specifications, consistent compact labels, and two clear surface levels. Favor whitespace, alignment, and subtle separators over nested cards, glass effects, heavy shadows, or decorative animation.

This direction retains the current identity and uses the UI/UX Pro Max result for Minimalism & Swiss Style as a fit signal. Its generic glass and scroll-storytelling suggestions were rejected because the project brief explicitly favors restrained motion, direct product discovery, and low visual complexity.

## Scope and constraints

- Apply the redesign to the actual client routes, including the admin experience as a separate data-dense workflow.
- Preserve route paths, route guards, APIs, cookies, CSRF, auth ownership, response contracts, payment integrations, pricing, inventory, and order behavior.
- Keep all customer-facing copy and states in English and Vietnamese. Reuse existing content and do not invent prices, stock, reviews, discounts, delivery promises, warranty claims, or social proof.
- Keep both existing color themes. Use current semantic tokens and add only missing aliases or interaction tokens with evidence.
- Do not add dependencies or rewrite backend services.
- Keep semantic HTML, keyboard operation, visible focus, reduced-motion support, meaningful alt text, responsive images, and WCAG 2.2 AA contrast and target-size expectations.
- Review the initial view and relevant post-interaction states at 360, 390, 768, 1024, and 1440px; do not accept clipped or obscured content.

## Acceptance criteria

1. Existing routes and core journeys remain functional: home → catalog → product; search/filter/sort → product; product → cart → current checkout/payment result; auth → account/orders; and applicable support/after-sales and admin tasks.
2. All existing route families use the same visual language while retaining customer-versus-admin density needs.
3. Product information and commercial claims remain sourced from current API/content data.
4. Desktop, tablet, and mobile states have no unintended horizontal overflow, clipped controls, or obstructed focus.
5. English/Vietnamese, light/dark, loading, empty, error, disabled, and success states remain legible and consistent.
6. Focus, keyboard operation, labels, contrast, reduced motion, and responsive target sizes receive explicit review.
7. Client typecheck, focused tests, full client tests, build, lint, and the requested Playwright Interactive browser checks are reported truthfully. Any environment-bound failures remain clearly labeled.

## Verification inventory

- Route and journey coverage will be maintained in the Playwright QA inventory before signoff.
- Test at 360, 390, 768, 1024, and 1440px; include English and Vietnamese and light and dark themes.
- Cover navigation/search, catalog filters and reset, product purchase action, empty and populated cart where safe fixture data allows, auth route protection, and representative customer/admin pages.
- Check keyboard focus and reduced motion, horizontal overflow, console errors, failed requests, text clipping, and visible overlay/focus obstruction.
- Treat fixture-backed admin and checkout states as fixture evidence, not as live production behavior.
