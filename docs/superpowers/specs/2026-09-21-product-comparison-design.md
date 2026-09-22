# Product Comparison — Design Specification

**Status:** Approved for implementation planning  
**Date:** 2026-09-21  
**Scope:** Public storefront comparison for catalog products

## Context

Digital-E already exposes catalog products with current VND pricing, sale pricing,
available stock, ratings, reviews, warranty data, and structured product
attributes. It does not yet have a comparison route, comparison API, or shared
selection state.

The feature must work for guests and authenticated customers, remain compatible
with the current independent client/server packages, preserve the existing
product/cart contracts, and support English/Vietnamese plus dark/light themes.

## Goals

- Let a shopper select and compare two to four products.
- Keep comparison useful by requiring all selected products to share a category.
- Use fresh server data for the comparison matrix instead of trusting cached
  product objects from the browser.
- Make the comparison page shareable with a bounded URL.
- Make the experience usable on desktop and mobile without page-level
  horizontal overflow.
- Keep all prices in VND and reuse the existing cart add flow.

## Non-goals

- No persistent comparison table or database record.
- No account-only behavior or login requirement.
- No price history, recommendation scoring, compatibility engine, or payment
  changes.
- No new product attribute schema or product catalog migration.

## Approved business rules

1. A comparison contains a minimum of two and a maximum of four distinct
   positive product IDs.
2. Products must exist in the public catalog and must not be deleted. Products
   with zero available stock remain comparable and show an unavailable state.
3. All products must belong to the same category. The category check is
   authoritative on the server; the client may provide an early convenience
   warning but cannot bypass the API rule.
4. Product data, availability, prices, ratings, reviews, warranty, and
   attributes come from the server at comparison-page load time.
5. The browser stores only a bounded list of product IDs under
   `digital-e:comparison:v1`. Invalid, duplicate, and over-limit IDs are
   discarded during hydration.
6. Add-to-cart actions use the existing cart context/API. The server remains
   authoritative for current price and stock during cart mutation.
7. Missing specification values are displayed as `—`; they are not silently
   removed from the matrix.

## Backend design

### Endpoint

```http
GET /api/products/compare?ids=12,18,24
```

The route must be declared before `GET /api/products/:id` so `compare` is not
interpreted as a product ID.

### Validation and errors

- Parse one comma-separated `ids` query value.
- Reject non-integer, non-positive, duplicate, fewer-than-two, or more-than-four
  IDs with HTTP 400 and the new error code `COMPARE_INVALID_IDS`.
- If one or more IDs do not resolve to public catalog products, return HTTP 404
  with `COMPARE_PRODUCTS_NOT_FOUND` and the missing IDs.
- If resolved products have different category IDs, return HTTP 422 with
  `COMPARE_CATEGORY_MISMATCH` and the category names needed for the UI message.
- Preserve the project response convention by returning a human-readable `msg`
  with the machine-readable `code` on this new route.

### Repository and service boundary

- Add a bounded batch read to the products repository using one parameterized
  `IN` query and the existing availability, rating, review, category, brand,
  and structured-attribute joins/selectors.
- Include category ID internally so the service can enforce the same-category
  rule without comparing display labels.
- Preserve the requested product order after the database query.
- Keep controllers thin: query parsing/response formatting in the controller;
  validation, category policy, and projection in the service; SQL in the
  repository.
- Normalize structured attributes to a stable API array of `{ key, label,
  type, value, unit }`. Keep the existing product `specifications` field in the
  response for legacy product fallback parsing on the client.

### Success response

```json
{
  "comparison": {
    "category": { "name": "Laptops" },
    "products": [
      {
        "id": 12,
        "name": "...",
        "sku": "...",
        "manufacturerPartNumber": "...",
        "warrantyMonths": 24,
        "category": "Laptops",
        "brand": "...",
        "price": 24990000,
        "sale_price": 19990000,
        "rating": 4.6,
        "reviews": 320,
        "main_image": "...",
        "stock": 8,
        "available_stock": 8,
        "description": "...",
        "specifications": "...",
        "attributes": [
          {
            "key": "memory",
            "label": "Memory (RAM)",
            "type": "text",
            "value": "16 GB",
            "unit": ""
          }
        ]
      }
    ]
  },
  "msg": "Products ready for comparison"
}
```

The response is deliberately bounded to four products and does not expose any
admin-only fields.

## Frontend design

### Shared state

Add a comparison context/hook responsible for:

- `selectedIds`, `add`, `remove`, `toggle`, `clear`, `isSelected`, and
  `canAdd`.
- Local-storage hydration and sanitization.
- A maximum of four IDs.
- Cross-page synchronization for the storefront shell.

The context stores IDs only. Product details are fetched again by `/compare`.

### Routes and entry points

- Add lazy route `/compare`.
- Add a clearly labeled `Compare` toggle to catalog product cards.
- Add the same action to the product detail page.
- Add a global comparison tray through the existing storefront layout. It shows
  selected product thumbnails, remove actions, `Clear all`, and a `Compare`
  action disabled until two products are selected.
- If a product from a known category is added while the current selection is
  another category, show an immediate localized warning and do not add it. The
  compare API remains the final authority after reload/deep-link navigation.

### Comparison page layout

- Desktop: a semantic comparison table with a sticky specification column and
  up to four product columns.
- Mobile: keep horizontal scrolling inside the comparison matrix only; never
  create body-level horizontal overflow. Keep product summary/action areas
  compact and readable above the matrix.
- Product headers show image, name, rating/review count, current VND price,
  crossed-out original price when applicable, stock state, remove action, and
  add-to-cart action.
- Add a `Show differences only` toggle. It hides rows where every product has
  the same normalized value; it never hides the product summary or action area.
- Use an em dash for missing values and visually distinguish unavailable stock
  without disabling comparison itself.
- Provide empty, one-product, loading, invalid-link, category-mismatch, not
  found, and retryable-error states with useful next actions.

### Visual and accessibility requirements

- Follow the existing semantic theme tokens in both dark and light modes.
- Keep selected, hover, pressed, disabled, focus-visible, and out-of-stock
  states readable with sufficient contrast; no text may disappear into a hover
  background.
- Maintain at least 44px interactive targets and prevent button labels from
  wrapping to two lines.
- Use a real `<table>` with caption, `scope="col"`/`scope="row"`, and a
  labelled scroll region. Provide accessible names for remove, clear, and
  compare actions.
- Product images require meaningful alt text. Loading/error updates use
  `aria-live` where appropriate.
- Respect reduced-motion preferences and avoid layout shift while product data
  loads.

### Localization and formatting

- Add all new copy to the existing EN/VI translation dictionaries.
- Use the existing VND currency formatter; do not introduce USD, Stripe, or
  bank-transfer copy.
- Keep machine error codes separate from translated user-facing messages.

## Verification plan

### Backend

- Unit-test ID parsing, duplicate/limit validation, missing products, category
  mismatch, requested-order preservation, and attribute projection.
- Verify the batch query is parameterized and bounded to four IDs.

### Frontend

- Test local-storage sanitization, add/remove/clear/max-limit behavior, category
  warning behavior, matrix row normalization, and differences-only filtering.
- Test EN/VI and dark/light rendering for every interactive state.

### Browser

Use Playwright at desktop 1440×900 and 1920×1080 plus a mobile viewport to
verify:

1. Add one product, then a second product and open comparison.
2. Attempt a fifth product and a different-category product.
3. Remove one item, clear all, reload, and open a copied comparison URL.
4. Compare products with missing attributes and zero stock.
5. Toggle differences-only, add an item to cart, switch language, and switch
   theme.
6. Confirm no body-level horizontal overflow and no clipped labels/buttons.

## Documentation updates after implementation

- Add the endpoint to `docs/API.md`.
- Update the relevant Wiki concept/architecture pages and append to `Wiki/log.md`.
- Add an ADR only if implementation requires a non-obvious persistence or API
  policy decision beyond this approved design.

