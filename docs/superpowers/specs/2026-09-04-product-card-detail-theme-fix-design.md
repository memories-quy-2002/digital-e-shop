# Product Card, Product Detail, and Informational Theme Alignment

## Status

Approved — implemented 2026-09-04

## Context

The Workbench / Signal visual system is already in place across the Digital-E client. The next refinement is intentionally narrow: make Home and Shop product cards behave and read as one component, prevent the Product Detail route from crashing on real API values, and remove color drift on About and News.

Browser inspection of the local seeded demo found these concrete issues:

- Home and Shop use separate card implementations with different spacing, image interactions, wishlist target sizes, and CTA treatment.
- Product Detail receives numeric MySQL values such as `rating`, `price`, and `sale_price` as strings. Rendering calls `toFixed` on `rating`, which crashes the route.
- Product specifications can arrive as legacy plain text such as `Core Ultra 7, integrated graphics, desktop socket`, although the parser primarily expects JSON.
- About and News contain hard-coded navy/white values and an informational alias layer that can diverge from the Workbench / Signal tokens, especially across light and dark themes.

## Goal

Deliver a consistent, accessible, responsive product-discovery experience while preserving existing routes, API response keys, auth/cart/wishlist behavior, and the current Workbench / Signal palette.

## Design direction

Keep the existing visual identity:

- Graphite backgrounds and mineral-charcoal panels for high-attention surfaces.
- Mineral-paper reading surfaces for catalog and informational content.
- Copper Signal for primary purchase actions and sale emphasis.
- Electric Blue for links, focus indication, and selected controls.
- Circuit Lime for positive stock/status signals, always paired with text.
- Exo 2 for display headings, Nunito Sans for body/UI text, and Roboto Mono for prices/spec metadata.

The refinement should feel like one deliberate system, not a new palette. Use existing `--de-*` tokens instead of introducing page-specific hex values.

## Proposed experience

### Shared Product Card

Create one reusable card composition for Home and Shop, with a small variant only when layout density requires it. The card should have:

1. A stable media frame with reserved height, descriptive alt text, and a clear fallback when an image is absent or fails.
2. A top utility row containing sale/stock status and a 44x44 minimum wishlist button with an accessible name.
3. An eyebrow for category or brand, followed by a two-line clamped product title. Both the media control and title link to `/product?id=<id>`.
4. A compact rating/review row and stock label using text plus icon, never color alone.
5. A price block that clearly distinguishes sale price, original price, and discount state.
6. A full-width primary Add to cart action with a minimum 44px height and visible keyboard focus.

Home and Shop should use the same DOM hierarchy, labels, interaction affordances, and skeleton proportions. Their surrounding grid may differ in column count, but the card itself should not visually fork.

### Product Detail

Normalize API values at the feature boundary before rendering. The page should have explicit loading, not-found, and error states. A valid legacy specification string should produce readable rows or highlights without logging a parsing error or aborting rendering.

Product Detail keeps the existing asymmetric gallery, purchase summary, quantity control, review/description/specification sections, and recommendation behavior. Recommended products must use the same numeric normalization and card rules so detail recommendations cannot reproduce the same crash.

### About and News

Keep the current content and layout, but align all surfaces and controls to the Workbench token map:

- Replace hard-coded navy, white, and overlay colors with `--de-color-*` tokens or token-derived opacity values.
- Ensure dark hero text and buttons use the inverse/on-strong tokens, while reading sections use normal text and muted text tokens.
- Ensure ghost buttons have a visible border in the surface where they render, not a white border that disappears on light surfaces.
- Keep section cards, timeline/milestone panels, article metadata, and CTA states visually related to the Home/Shop system.

## Technical boundaries

### Expected client changes

- Add or extract a shared `ProductCard` component under `client/src/components/common/`.
- Update `ProductItem.tsx` and `ShopsItem.tsx` to compose the shared card while preserving their current callback contracts, wishlist context, cart context, and navigation.
- Add a small product payload normalization helper in the existing product feature/types boundary. Convert numeric fields with safe defaults without changing the server contract.
- Update `ProductPage.tsx` and `RecommendedProduct.tsx` to consume normalized values and render explicit load/error states.
- Update `productDetails.ts` so valid legacy text is handled without error logging; preserve JSON specification support and serialization behavior.
- Update `_home.scss`, `_shops.scss`, `_product.scss`, `_informational.scss`, `_about.scss`, and `_news.scss` only as needed to apply tokenized shared states. Avoid reintroducing Bootstrap.

### Out of scope

- No backend route, database, seed, auth, CSRF, CORS, or API response-contract changes.
- No replacement of the Workbench / Signal palette.
- No broad redesign of unrelated account, checkout, or admin surfaces.
- No new UI dependency when existing Tailwind/shadcn-style primitives and current icon components are sufficient.

## Accessibility and responsive requirements

- Media and title interactions are keyboard accessible and have clear accessible names.
- Wishlist, cart, quantity, and navigation controls are at least 44x44px, with at least 8px separation where adjacent.
- Text contrast is at least 4.5:1 for normal text; status meaning is represented by text as well as color.
- Focus rings remain visible on both dark and light surfaces.
- No horizontal overflow at 375px, 768px, 1024px, and 1440px.
- Nonessential motion respects `prefers-reduced-motion`.
- Loading, empty, not-found, and error states are visible and understandable.

## Verification plan

### Automated checks

- Add focused client tests for numeric product normalization and legacy specification parsing.
- Add/extend rendering tests for Product Card accessible names and Product Detail’s non-crashing numeric display.
- Run frontend typecheck, build, lint, and test commands from `AGENTS.md`.

### Playwright checks

Use the local seeded demo and capture artifacts only under `output/playwright/`:

- Home: inspect card layout, image fallback, wishlist/cart names, and click the first product into Product Detail.
- Shop: inspect the same card contract and click through to Product Detail.
- Product Detail: verify the page renders, price/rating/specifications are visible, and the browser console has no `toFixed`/JSON parse crash.
- About and News: verify hero/reading-surface color consistency in the current theme and after switching theme if the control is available.
- Mobile viewport: verify 375px layout, no horizontal scrolling, readable card CTA, and accessible controls.
- Capture desktop and mobile screenshots plus accessibility snapshots for review.

## Acceptance criteria

- Home and Shop cards share one coherent visual and interaction system.
- Clicking a seeded Home or Shop product opens a rendered Product Detail page without a React crash.
- Product Detail handles API numeric strings and legacy specification text.
- About and News no longer contain theme-inconsistent hard-coded surface colors in the touched UI.
- Focus, touch-target, contrast, responsive, loading, and fallback requirements are met.
- Existing API keys and user-facing behavior remain compatible.
- Verification results are reported with any environment-only failures clearly separated from product defects.
