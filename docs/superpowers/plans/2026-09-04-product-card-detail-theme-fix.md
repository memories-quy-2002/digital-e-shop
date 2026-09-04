# Product Card, Product Detail, and Theme Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Home and Shop use one accessible Workbench / Signal product card, fix Product Detail rendering for real API payloads, and align About/News colors with the existing theme tokens.

**Architecture:** Normalize product payloads in `client/src/utils/product.ts` before data enters page state. Render Home and Shop through a shared `ProductCard` that composes existing shadcn-style `Card`, `Button`, and `Badge` primitives. Keep Product Detail and informational page structure intact, changing only loading/error/data safety and tokenized styling.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS v4, existing shadcn-style primitives, SCSS tokens, Vitest, Testing Library, Playwright CLI.

**Status:** Implemented and verified on the local seeded demo.

## Global Constraints

- Preserve existing routes, API keys, callback contracts, auth/cart/wishlist behavior, cookies, CSRF, and server response shapes.
- Use Tailwind CSS and existing shadcn-style primitives for the migrated product card; do not add Bootstrap or new UI dependencies.
- Preserve Workbench / Signal tokens: graphite `#111416`, mineral panels `#1C2429`/`#263137`, paper `#E7E3DA`, copper `#E4663D`, electric blue `#4C8DFF`, and circuit lime `#B6D546`.
- Keep normal text contrast at least 4.5:1, visible focus states, 44x44px touch targets, and no horizontal overflow at 375px.
- Preserve unrelated dirty worktree changes and do not modify server/database code.

---

### Task 1: Normalize product payloads and legacy specifications

**Files:**
- Create: `client/src/utils/product.ts`
- Test: `client/src/utils/__tests__/product.test.ts`
- Modify: `client/src/utils/productDetails.ts`
- Test: `client/src/utils/__tests__/productDetails.test.ts`
- Modify: `client/src/features/products/api.ts`
- Modify: `client/src/pages/HomePage.tsx`
- Modify: `client/src/pages/ShopsPage.tsx`

**Interfaces:**
- Produce `normalizeProduct(value: unknown): Product` and `normalizeProducts(value: unknown): Product[]`.
- `normalizeProduct` converts string numeric fields from MySQL to finite numbers, keeps `sale_price` nullable, and returns safe empty defaults for missing display fields.
- Product feature API functions and Home/Shop product fetches consume the helpers; backend payload keys remain unchanged.

- [ ] **Step 1: Write the failing normalization tests**

```ts
import { describe, expect, it } from "vitest";
import { normalizeProduct, normalizeProducts } from "../product";

describe("normalizeProduct", () => {
    it("converts MySQL string fields into the Product numeric contract", () => {
        const product = normalizeProduct({
            id: "190",
            name: "Demo Intel Core Ultra Kit",
            category: "PC",
            brand: "Intel",
            price: "449.00",
            sale_price: "419.00",
            rating: "4.0",
            reviews: "2",
            stock: "39",
            main_image: null,
            description: "Desktop kit",
            specifications: "Core Ultra 7, integrated graphics",
        });

        expect(product).toMatchObject({ id: 190, price: 449, sale_price: 419, rating: 4, reviews: 2, stock: 39 });
    });

    it("keeps absent sale prices null and rejects invalid collection values", () => {
        expect(normalizeProduct({ id: "bad", sale_price: "", price: "bad" })).toMatchObject({
            id: 0,
            price: 0,
            sale_price: null,
        });
        expect(normalizeProducts(null)).toEqual([]);
    });
});
```

- [ ] **Step 2: Run the focused test and verify the expected RED failure**

Run `client\node_modules\.bin\vitest.cmd run src/utils/__tests__/product.test.ts` from `client`.

Expected result: FAIL because `../product` does not exist yet.

- [ ] **Step 3: Write the minimal normalization implementation**

```ts
import type { Product } from "../types/product";

const asNumber = (value: unknown, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const nullableNumber = (value: unknown) => {
    if (value === null || value === undefined || value === "") return null;
    return asNumber(value, 0);
};

export const normalizeProduct = (value: unknown): Product => {
    const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    return {
        id: asNumber(source.id),
        name: String(source.name ?? ""),
        category: String(source.category ?? ""),
        brand: String(source.brand ?? ""),
        price: asNumber(source.price),
        sale_price: nullableNumber(source.sale_price),
        rating: asNumber(source.rating),
        reviews: asNumber(source.reviews),
        main_image: source.main_image ? String(source.main_image) : null,
        stock: asNumber(source.stock),
        description: String(source.description ?? ""),
        specifications: source.specifications === null || source.specifications === undefined
            ? null
            : String(source.specifications),
    };
};

export const normalizeProducts = (value: unknown): Product[] =>
    Array.isArray(value) ? value.map(normalizeProduct) : [];
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same Vitest command. Expected result: PASS.

- [ ] **Step 5: Add the parser regression assertion before changing parser code**

Add this test to `parseProductDetails`:

```ts
it("treats legacy comma-separated specifications as valid input without logging", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(parseProductDetails("Core Ultra 7, integrated graphics, desktop socket").specifications).toEqual([
        { label: "Specification", value: "Core Ultra 7" },
        { label: "Specification", value: "integrated graphics" },
        { label: "Specification", value: "desktop socket" },
    ]);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
});
```

Import `vi` alongside `describe`, `it`, and `expect`.

- [ ] **Step 6: Run the parser test and verify the expected RED failure**

Run `client\node_modules\.bin\vitest.cmd run src/utils/__tests__/productDetails.test.ts` from `client`.

Expected result: the new test fails because the current invalid-JSON fallback calls `console.error`.

- [ ] **Step 7: Remove only the noisy legacy parse log and reuse existing fallback behavior**

Change the `catch (err)` block in `parseProductDetails` to `catch {}`. Do not change the JSON or comma-split output contract.

- [ ] **Step 8: Run parser tests and verify GREEN**

Run the parser test command again. Expected result: all parser tests PASS with no console output.

- [ ] **Step 9: Apply normalization at existing fetch boundaries**

Use `normalizeProduct`/`normalizeProducts` in `fetchProduct`, `fetchRelevantProducts`, Home product/recommendation/wishlist mapping, and Shop product response mapping. Leave wishlist item IDs and API URLs unchanged.

---

### Task 2: Build the shared Home/Shop Product Card

**Files:**
- Create: `client/src/components/common/ProductCard.tsx`
- Test: `client/src/components/common/__tests__/ProductCard.test.tsx`
- Modify: `client/src/components/common/ProductItem.tsx`
- Modify: `client/src/components/common/ShopsItem.tsx`

**Interfaces:**
- `ProductCardProps` accepts `product`, `uid`, `isWishlist`, optional `isWishlistPending`, `onToggleWishlist`, and `onAddingCart` with the existing callback signatures.
- Product Card renders a shared semantic hierarchy and keeps both existing wrapper component exports intact.

- [ ] **Step 1: Write the failing Product Card render test**

```tsx
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ProductCard from "../ProductCard";

const product = {
    id: 190, name: "Demo Intel Core Ultra Kit", category: "PC", brand: "Intel",
    price: 449, sale_price: 419, rating: 4, reviews: 2, main_image: null,
    stock: 39, description: "Desktop kit", specifications: "Core Ultra 7",
};

describe("ProductCard", () => {
    it("exposes one shared product link and 44px action names", () => {
        render(<MemoryRouter><ProductCard product={product} uid="" isWishlist={false} onToggleWishlist={vi.fn()} onAddingCart={vi.fn()} /></MemoryRouter>);
        expect(screen.getByRole("link", { name: product.name })).toHaveAttribute("href", "/product?id=190");
        expect(screen.getByRole("button", { name: "Add to wishlist" })).toHaveAttribute("aria-pressed", "false");
        expect(screen.getByRole("button", { name: /Add to cart/i })).toBeEnabled();
    });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run `client\node_modules\.bin\vitest.cmd run src/components/common/__tests__/ProductCard.test.tsx` from `client`.

Expected result: FAIL because `ProductCard.tsx` does not exist yet.

- [ ] **Step 3: Implement ProductCard with Tailwind and existing shadcn primitives**

Use `Card`, `CardContent`, `Button`, `Badge`, `HeartIcon`, `HeartFillIcon`, `CartIcon`, `loadImage`, `normalizeProduct`, and `ratingStar`. The card must use a `Link` for the media and title, `size="icon"` for the 44px wishlist button, `line-clamp-2` for the title, normalized numeric price/rating values, and `disabled={stock <= 0}` for the cart action. Use `aria-pressed`, `aria-label`, and `data-testid="product-card"`; the main CTA uses `variant="default"` and is full width.

- [ ] **Step 4: Replace ProductItem and ShopsItem markup with thin ProductCard wrappers**

Each wrapper forwards all current props without changing callback order or export names. Remove unused `useNavigate`, `loadImage`, icon, and rating imports from the wrappers.

- [ ] **Step 5: Run Product Card test and verify GREEN**

Run the same focused Vitest command. Expected result: PASS.

- [ ] **Step 6: Run frontend typecheck after the shared component integration**

Run `client\node_modules\.bin\tsc.cmd -p client\tsconfig.json --noEmit` from the repository root. Expected result: no new errors attributable to ProductCard.

---

### Task 3: Make Product Detail data-safe and visibly stateful

**Files:**
- Modify: `client/src/features/products/pages/ProductPage.tsx`
- Modify: `client/src/features/products/components/RecommendedProduct.tsx`
- Modify: `client/src/styles/pages/_product.scss`

**Interfaces:**
- `fetchProduct` and `fetchRelevantProducts` now return normalized `Product` objects from Task 1.
- Product Detail displays loading/error states while preserving the current purchase, review, recommendation, wishlist, and route behavior.

- [ ] **Step 1: Add a focused regression test for the numeric display helper**

Add a small exported helper to `client/src/utils/product.ts` beside the normalization helpers:

```ts
export const formatProductRating = (value: number | string | null | undefined) => Number(value || 0).toFixed(1);
```

Add `client/src/features/products/pages/__tests__/ProductPage.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { formatProductRating } from "../../../../utils/product";

describe("formatProductRating", () => {
    it("formats numeric strings returned by MySQL", () => {
        expect(formatProductRating("4.0")).toBe("4.0");
    });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run `client\node_modules\.bin\vitest.cmd run src/features/products/pages/__tests__/ProductPage.test.ts` from `client`.

Expected result: FAIL because the helper is not exported yet.

- [ ] **Step 3: Implement the minimal Product Detail state and normalization use**

Add `isLoadingProduct` and `productLoadError` state. Set loading before `fetchProduct`, clear it in `finally`, set an error for a null response or rejected request, and render a tokenized loading/error panel before reading product-derived values. Replace both `displayedRating.toFixed(1)` calls with `formatProductRating(displayedRating)`. Use an explicit sale check (`sale_price !== null && sale_price < price`) for the active price. Keep invalid `pid <= 0` routed to `NoPage`.

Use `formatProductRating` in `RecommendedProduct` if it displays a rating string, and retain the existing recommendation route behavior.

- [ ] **Step 4: Run the Product Detail test and verify GREEN**

Run the focused helper test. Expected result: PASS.

- [ ] **Step 5: Add loading/error state styling using existing tokens**

Add `.product-page__state` in `_product.scss` with `min-height`, `display:grid`, centered content, `border`, `border-radius`, `background: var(--de-color-surface)`, `color: var(--de-color-text-soft)`, and a link/button style using `var(--de-color-electric)`; do not add hard-coded palette values.

- [ ] **Step 6: Run all focused client tests**

Run the normalization, parser, ProductCard, and Product Detail test files together. Expected result: all PASS.

---

### Task 4: Align About and News with Workbench tokens

**Files:**
- Modify: `client/src/styles/pages/_informational.scss`
- Modify: `client/src/styles/pages/_about.scss`
- Modify: `client/src/styles/pages/_news.scss`

**Interfaces:**
- Keep existing About/News markup, content, route behavior, and responsive structure.
- Replace hard-coded navy/white/gradient values in touched surfaces with existing `--de-color-*` tokens and token-derived opacity colors.

- [ ] **Step 1: Replace informational action aliases with theme-safe token rules**

Use `--de-color-on-accent` for primary action text and define `.ghost` border/color from `--de-color-border-strong` and `--de-color-text` by default. Let hero-specific selectors override with `--de-color-on-strong` and the strong-surface border token.

- [ ] **Step 2: Tokenize About hero and milestones**

Change About hero text to `var(--de-color-on-strong)`, hero copy to `color-mix(in srgb, var(--de-color-on-strong) 88%, transparent)`, milestone background to `var(--de-color-surface-strong)`, milestone text to `var(--de-color-on-strong)`, and replace the hard-coded blue overlay gradient with a token-derived `color-mix` overlay. Preserve the hero image and layout.

- [ ] **Step 3: Tokenize News hero, ticker, and overlay**

Change News hero background/text/overlay/ticker border/text to the existing strong-surface, on-strong, and border tokens. Keep the featured article paper surface and existing electric-blue metadata accents.

- [ ] **Step 4: Search touched informational styles for remaining hard-coded surface colors**

Run `rg -n '#152235|#fff|rgba\(15, 23, 42|rgba\(255, 255, 255' client/src/styles/pages/_informational.scss client/src/styles/pages/_about.scss client/src/styles/pages/_news.scss`.

Expected result: no hard-coded theme surface/text values remain in these selectors; any intentional opacity must be expressed through existing token variables.

---

### Task 5: Verify end-to-end behavior and visual responsive states

**Files:**
- Modify only as needed based on verification findings.
- Artifacts: `output/playwright/product-card-detail-home.png`, `output/playwright/product-card-detail-shop.png`, `output/playwright/product-card-detail-mobile.png`, `output/playwright/about-news-theme.png`.

- [ ] **Step 1: Run frontend typecheck, test, build, and lint**

Run from the repository root:

```powershell
client\node_modules\.bin\tsc.cmd -p client\tsconfig.json --noEmit
pnpm --filter client test -- --run
pnpm --filter client build
pnpm --filter client lint
```

Record any pre-existing environment or unrelated failures separately.

- [ ] **Step 2: Use Playwright on Home and Shop**

Open the local client, snapshot before interactions, verify `ProductCard` accessible names, click a product title/media, and confirm the URL `/product?id=190` (or another seeded ID) renders a Product Detail heading rather than a blank/crashed page.

- [ ] **Step 3: Inspect Product Detail console output**

After navigation, snapshot again and confirm there are no `toFixed`, `Unexpected token`, or React render exceptions. Expected remaining `401` requests for unauthenticated user state are environment/auth behavior, not Product Detail crashes.

- [ ] **Step 4: Inspect About and News colors and mobile layout**

Capture desktop screenshots for About and News, resize to 390x844, verify no horizontal overflow, card CTA visibility, and accessible 44px controls. Capture the mobile product card screenshot.

- [ ] **Step 5: Review the final diff**

Run `git diff --check` and `git status --short`; confirm only the intended client files, plan/spec, and Playwright artifacts changed. Do not stage or commit because Git ref writes are unavailable in this workspace.
