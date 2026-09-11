# Digital-E Catalog Discovery & Comparison Design

**Status:** Revised draft after feasibility audit; awaiting user approval before implementation

**Date:** 2026-09-11

**Scope:** Sprint 1 and Sprint 2 only

## Goal

Improve Digital-E's catalog discovery and product-evaluation experience for a general electronics store without turning the product into a PC-only storefront.

This design covers exactly two delivery sprints:

- **Sprint 1:** Catalog taxonomy refinement + dynamic category-specific technical facets.
- **Sprint 2:** Product comparison + Search v2 using existing SKU, MPN, and typed product attributes.

The implementation must preserve current checkout, orders, product snapshots, recommendations, wishlist, reviews, admin operations, and existing product-list API compatibility.

## Current state findings

Digital-E is already a broad electronics store. The current demo/catalog data spans laptops, smartphones, PCs and peripherals, monitors, headphones/audio, graphics cards, consoles, and cameras. The current catalog therefore needs a taxonomy and discovery model that works across different technical product families rather than one optimized only for PC parts.

The current backend already provides several useful foundations:

- `products.category_id` points to the legacy `categories` table.
- `products.brand_id` points to `brands`.
- Products already support SKU, manufacturer part number, warranty metadata, price/sale price, stock, descriptions, and free-form `specifications`.
- `product_attributes` stores typed technical attributes with key, label, value type, text/number value, unit, and `filterable`.
- `GET /api/products` already accepts JSON-encoded `attributeFilters` and applies text or numeric filters server-side.
- `GET /api/products/facets` currently exposes category, brand, price bounds, and total product count.
- Product recommendation and relevant-product endpoints already exist.
- The storefront already has search, filters, pagination, URL state, recently viewed, recommendations, wishlist, and product detail pages.

The main gaps are therefore not missing storage primitives but incomplete use of the existing catalog model:

1. The category model is flat and contains legacy/ambiguous names such as `PC`, `Phone`, `Speaker`, `Headphone`, `Desktop`, and `Other`.
2. The storefront filter UI only exposes category, brand, and price even though typed attribute filtering already exists on the backend.
3. Search relevance covers product name, brand, category, and description, but not SKU, MPN, or typed technical attributes.
4. Product comparison is explicitly deferred in the project Wiki and has not yet been implemented.

## Implementation-readiness decisions

The architecture is feasible, but implementation must follow these decisions so the
design matches the current repository and CI database:

1. The first demo taxonomy contains Laptop, PC, Graphics Card, Monitor,
   Smartphone, Headphone, Console, and Camera. Technical facets are exposed only
   for definitions that the demo seed also writes as typed product attributes.
   Categories without technical metadata still support the normal category,
   brand, price, and commercial comparison fields.
2. The rollout never rewrites products.category_id. A category scope contains the
   canonical category row plus existing legacy category rows whose names are
   registered aliases. Listing, facet, search, and comparison queries use that
   scope explicitly.
3. The demo seed is the source of truth for typed attribute values and
   manufacturer part numbers used by Search v2 and comparison. Free-form
   specifications are display data and are not a substitute for typed values.
4. GET /api/products?category=<canonical-slug> is additive. Existing
   categories=... callers remain supported, and old category names resolve
   through the same canonical scope resolver.
5. A category-qualified facet response scopes categories, brands, prices, total,
   and technical facets to the resolved category scope. The no-category response
   keeps the existing global behavior.
6. Search tokenization is shared by the search endpoint and the product-list
   query. Meaningful tokens use AND semantics, while exact SKU/MPN matches may
   bypass the generic minimum-length rule. Numeric matching normalizes 240,
   240Hz, and 240 Hz to the same searchable signal.
7. Comparison selection is owned by one client provider mounted above the
   router. Cards, the shop result list, home results, and the product page all
   use that provider instead of maintaining separate local selections.
8. Integration tests own their catalog fixtures and do not assume that the
   demo seed ran. Performance tests select same-category comparison IDs from
   the test response or skip that read when the fixture has fewer than two
   comparable products.

## Design principles

1. **General-electronics first.** The catalog must work for laptops, phones, monitors, audio, cameras, consoles, PC components, and peripherals.
2. **Additive compatibility.** Existing product IDs, category IDs, product API response fields, order snapshots, and saved URLs should keep working during rollout.
3. **Server-authoritative metadata.** Category/facet metadata belongs on the server; the client should not hard-code product-domain logic.
4. **Reuse typed attributes.** Do not introduce a second specification/value store when `product_attributes` already exists.
5. **Progressive normalization.** Improve taxonomy without requiring a destructive catalog rewrite.
6. **One source of truth per responsibility.** Category hierarchy/aliases describe navigation; product attributes describe per-product technical values.
7. **YAGNI.** Do not add Elasticsearch/OpenSearch, a vector database, or an external search provider in these sprints.

## Considered approaches

### Approach A — Client-owned category and facet definitions

The React client would contain a map such as `Laptop -> RAM/Storage/Display`, `Monitor -> Resolution/RefreshRate`, and build filters locally.

**Pros**

- Fastest initial implementation.
- No schema change required.

**Cons**

- Duplicates domain metadata outside the server.
- Admin-created or renamed categories can drift from the client map.
- Difficult to keep labels, units, ordering, comparison behavior, and API validation consistent.

**Decision:** Reject.

### Approach B — Additive server-driven taxonomy metadata with existing product attributes

Keep the legacy `categories` identity table and `product_attributes` value table, then add additive catalog metadata for canonical category presentation, aliases, grouping, and attribute/facet definitions. Existing category IDs remain valid.

**Pros**

- Preserves current product/order relationships.
- Makes facets and comparison metadata server-driven.
- Reuses current attribute values and filtering code.
- Supports gradual migration of legacy category names.

**Cons**

- Requires one forward migration and compatibility logic.
- Admin product category behavior must be tightened so arbitrary duplicate categories are not created silently.

**Decision:** **Selected.**

### Approach C — Full normalized catalog ontology rewrite

Replace the current categories and attribute metadata with a new generalized taxonomy/ontology model and migrate every product.

**Pros**

- Most normalized long-term model.

**Cons**

- High migration risk.
- Large surface area across admin, APIs, order snapshots, demo seed, tests, docs, and client routes.
- Unnecessary for the current scale and Sprint 1–2 goals.

**Decision:** Reject for now.

---

# Sprint 1 — Catalog Taxonomy + Dynamic Technical Facets

## 1. Taxonomy model

The existing `categories` table remains the product foreign-key target. Do not replace `products.category_id`.

Add lightweight taxonomy metadata so each category can be presented consistently without breaking its identity:

```text
categories
----------
id                existing primary key
name              existing compatibility/display value
slug              new stable URL-safe identifier
catalog_group      new broad navigation group
is_active          new visibility flag
sort_order         new navigation order
```

Recommended broad groups for the current Digital-E catalog:

```text
Computers
Displays
Mobile
Audio
Gaming
Cameras
```

Examples:

```text
Laptop          -> Computers / laptops
Desktop         -> Computers / desktops
PC              -> Computers / pc-and-peripherals (legacy-compatible)
Graphics Card   -> Computers / graphics-cards
Monitor         -> Displays / monitors
Smartphone      -> Mobile / smartphones
Phone           -> Mobile / smartphones (legacy alias)
Headphone       -> Audio / headphones
Speaker         -> Audio / speakers
Console         -> Gaming / consoles
Camera          -> Cameras / cameras
```

The first migration does **not** delete legacy category rows. It adds stable metadata and maps known current values.

### Category aliases

Introduce an additive alias table:

```text
category_aliases
----------------
id
alias_slug
alias_name
category_id
```

Use aliases for legacy synonyms and old bookmarked filter values, for example:

```text
Phone       -> Smartphone
Headphones  -> Headphone
GPU         -> Graphics Card
```

The API should normalize known aliases to a canonical category scope before
filtering. The scope includes the canonical category ID and any existing legacy
category IDs whose names match registered aliases. Existing exact category names
continue to work during the migration period; no product row is moved between
categories as part of this feature.

## 2. Category attribute definitions

`product_attributes` stores values but repeats labels/type/unit metadata per product. Sprint 1 needs stable facet and comparison metadata that is not inferred inconsistently from arbitrary product rows.

Add a lightweight definition table:

```text
category_attribute_definitions
------------------------------
id
category_id
attribute_key
label
value_type          text | number
unit                nullable
filterable          boolean
comparable          boolean
facet_order         integer
comparison_order    integer
```

Constraints:

- unique `(category_id, attribute_key)`
- `value_type` must match the product attribute value type for that category/key
- `filterable=false` excludes the attribute from catalog facets
- `comparable=false` excludes it from the comparison table unless explicitly requested later

This table does not store product values. Values remain in `product_attributes`.

## 3. Dynamic facet API

Extend the existing facets contract rather than creating an unrelated endpoint.

Current:

```http
GET /api/products/facets
```

Add optional category context:

```http
GET /api/products/facets?category=laptops
GET /api/products/facets?category=monitors
```

The response remains backward compatible and adds `attributeFacets` and category metadata:

```json
{
  "facets": {
    "categories": [],
    "brands": [],
    "minPrice": 0,
    "maxPrice": 0,
    "totalProducts": 0,
    "category": {
      "id": 2,
      "name": "Laptop",
      "slug": "laptops",
      "group": "Computers"
    },
    "attributeFacets": [
      {
        "key": "ram_gb",
        "label": "Memory",
        "type": "number",
        "unit": "GB",
        "min": 8,
        "max": 64,
        "order": 10
      },
      {
        "key": "display_type",
        "label": "Display type",
        "type": "text",
        "values": [
          { "value": "OLED", "count": 4 },
          { "value": "IPS", "count": 8 }
        ],
        "order": 20
      }
    ]
  }
}
```

Rules:

- Attribute facets are returned only from active, filterable definitions.
- Text facet values come from distinct real product values for the selected category.
- Numeric facets expose server-derived min/max across matching products.
- Facet counts must reflect current catalog visibility rules (`stock >= 0`) and category selection.
- Brand/price facets continue to work.
- Missing/unknown category returns the normal global facets response plus an empty `attributeFacets` array; do not fail the full catalog page.

For a known category or alias, base facets are scoped to the canonical category
scope as well as technical attributes: categories, brands, price bounds, and
totalProducts must describe the same product set. An unknown category keeps the
existing global fallback behavior and returns no technical facets.

## 4. Storefront filter behavior

Update `ShopsPage` and the sidebar/filter components so attribute filters are driven by API metadata.

URL contract:

```text
/shops?category=laptops&ram_gb=16:64&display_type=OLED,IPS
```

The client may internally serialize to the backend's existing `attributeFilters` JSON contract, but the browser URL should remain human-readable and shareable.

Rules:

- The canonical category query is sent to both the product-list and facets
  endpoints, so results and metadata use the same resolved category scope.
- GET /api/products?category=<canonical-slug> is additive. Existing
  categories=... requests remain valid for old URLs and callers.
- Selecting exactly one canonical category enables category-specific technical facets.
- With zero categories selected, only global category/brand/price controls are shown.
- With multiple categories selected, hide category-specific attribute facets because the attribute vocabulary may be incompatible across categories.
- Changing the selected category clears incompatible attribute filters.
- Browser back/forward restores filter state.
- Reset clears technical facets as well as category/brand/price.
- The client never invents facet keys or labels.

## 5. Admin catalog behavior

The existing product create/update service currently creates a category row automatically when it receives an unknown category string. That behavior conflicts with a canonical taxonomy.

After Sprint 1:

- Product creation/update must resolve to an active canonical category.
- The normal admin product form uses a server-provided category list instead of free-creating category rows.
- Arbitrary category creation is out of scope for the product editor.
- Creating/managing taxonomy itself is not exposed as a new admin UI in these sprints; initial taxonomy metadata is migration/seed-owned.

This prevents spelling variants such as `Headphones`, `headphone`, and `Headphone` from creating separate catalog branches.

## 6. Sprint 1 acceptance criteria

### Functional

- Current products remain addressable by the same product IDs.
- Existing `GET /api/products` callers without attribute filters behave unchanged.
- Existing category filter values continue to resolve through canonical names or aliases.
- Selecting one category on `/shops` shows only relevant server-driven technical facets.
- Text and numeric attribute filters reach the existing backend `attributeFilters` query path.
- Filter state survives reload and browser navigation.
- Changing category removes incompatible attribute state.
- Admin product create/update cannot silently create a duplicate free-form category.

### Data integrity

- No product.category_id is rewritten to make an alias work; alias filtering
  uses the resolved category scope.
- Demo seed produces deterministic canonical taxonomy metadata, attribute
  definitions, typed product attributes, and manufacturer part numbers.
- Verification allows unrelated legacy category rows to remain; it asserts every
  required demo taxonomy row and its metadata instead of requiring the total
  active-category count to equal the demo taxonomy count.
- No order-item snapshot is rewritten.
- No product is orphaned from its category.
- Category metadata migration is forward-only and compatible with `prisma migrate deploy`.
- Demo seed produces deterministic canonical taxonomy metadata and attribute definitions.

### Accessibility

- Facet groups use semantic fieldset/legend or equivalent labelled structures.
- Every checkbox, range input, and reset action has a visible label.
- Filter updates provide a non-disruptive live-region result count.
- Technical filters remain keyboard accessible on desktop and mobile filter surfaces.

### Performance

- Facet aggregation must avoid one query per attribute.
- Category-specific facet requests should remain suitable for the existing read-only k6 catalog suite.
- No new external search/cache dependency is introduced.

---

# Sprint 2 — Product Comparison + Search v2

## 7. Product comparison

Comparison is a general electronics feature, not PC-specific.

Supported entry points:

- product cards on `/shops`
- product detail page
- dedicated comparison route

New route:

```text
/compare?products=12,19,24
```

Rules:

- Minimum two products, maximum four.
- Products must resolve to the same canonical category.
- Attempting to mix categories shows a clear client validation message and does not add the incompatible item.
- Comparison selection can be client-side persisted for the active browser session/local storage; it does not require authentication.
- The comparison route remains directly shareable through product IDs in the URL.

## 8. Comparison API contract

Prefer an additive batch endpoint rather than N independent product-detail requests:

```http
GET /api/products/compare?ids=12,19,24
```

Response:

```json
{
  "category": {
    "id": 24,
    "name": "Monitor",
    "slug": "monitors"
  },
  "products": [],
  "rows": [
    {
      "key": "resolution",
      "label": "Resolution",
      "type": "text",
      "unit": null,
      "values": {
        "12": "2560x1440",
        "19": "3840x2160",
        "24": "2560x1440"
      }
    }
  ]
}
```

The server uses `category_attribute_definitions.comparable` and `comparison_order` to build stable rows.

Always include a fixed commercial summary before technical attributes:

```text
Image
Product name
Brand
Current price
Sale status
Rating/review count
Available stock
Warranty
SKU/MPN
```

Then append ordered comparable technical attributes.

The comparison batch query must select product category IDs and typed product
attributes in bounded reads. The server resolves each product through the
canonical category scope and rejects missing IDs or products from different
canonical categories before shaping the response. A standalone
product-attribute batch read is required; comparison must not depend on a
transaction-only repository method.

## 9. Comparison UI

The comparison page should support:

- 2–4 product columns.
- sticky product header on long tables where practical.
- remove product.
- add to cart.
- add/remove wishlist when authenticated.
- `Show differences only` toggle.
- clear comparison.
- empty-state CTA back to `/shops`.

Mobile behavior:

- Do not shrink four products into unreadable columns.
- Use an accessible horizontal-scroll comparison region with sticky attribute labels where feasible.
- Preserve product identity while scrolling.

Do not add "best product" badges or subjective winner logic in Sprint 2.

## 10. Search v2

Extend the current MySQL relevance search; do not introduce an external search service.

Searchable fields become:

```text
product name
SKU
manufacturer part number
brand
category
product description
filterable/comparable typed product attributes
```

Example queries that should become meaningfully searchable:

```text
RTX 4070 12GB
AM5 12 core
OLED 16GB
240Hz monitor
Canon RF 4K
DEMO-0004
manufacturer part number exact value
```

### Relevance order

Recommended ranking priority:

1. exact SKU match
2. exact MPN match
3. exact product-name match
4. product-name prefix match
5. product-name token/substring match
6. brand/category exact match
7. technical attribute value match
8. description match
9. current rating/review signals as a small tie-breaker

Price discounts must not overpower textual relevance.

### Search safety

- Keep parameterized SQL for all user values.
- Attribute matching must use controlled joins/EXISTS queries; never interpolate user-entered attribute keys directly into SQL identifiers.
- Preserve the minimum term length for generic text search, but allow exact SKU/MPN lookups even if their normalized token is short enough to otherwise fail that threshold.
- Bound result count as today.

### Search matching semantics

- Tokenize on whitespace and punctuation after trimming, case folding, and
  removing empty tokens.
- Every meaningful token must match at least one searchable field or typed
  attribute. This makes multi-token queries such as OLED 16GB conjunctive.
- Searchable identity fields include SKU and manufacturer part number. Exact
  full-value matches rank ahead of partial matches.
- Numeric attribute matching uses one shared normalization expression for stored
  values and query terms. It must treat 240, 240Hz, and 240 Hz as the same
  numeric signal while preserving units when different attributes share a
  number.
- The same token and numeric helpers are used by the search endpoint and the
  filtered product-list path.

## 11. Search and catalog integration

Search v2 must work with existing filters:

```text
search term + category + brand + price + technical attribute filters + sort
```

The `/shops` page remains the canonical full-result surface.

Header autocomplete/search suggestions may continue using the existing search endpoint; Sprint 2 does not add a separate search UI subsystem.

When a search query is active:

- category-specific facets still depend on the selected canonical category, not on guessed query intent.
- search does not auto-switch category based on keywords.
- URL remains the source of truth for the result page.

## 12. Sprint 2 acceptance criteria

### Product comparison

- User can select and compare 2–4 products from the same canonical category.
- Comparison URL is shareable and reload-safe.
- Technical rows are built from server-owned attribute definitions and existing product attribute values.
- `Show differences only` hides rows whose normalized values are identical across all compared products.
- Missing optional attributes render as `—`, not fake values.
- Add-to-cart uses current server-authoritative stock/cart behavior; comparison never owns stock state.

### Search v2

- Exact SKU and MPN searches rank the matching product first.
- Technical terms such as `240Hz`, `12GB`, `OLED`, or `AM5` can find relevant products when those values exist in typed attributes.
- Existing name/brand/category searches do not regress.
- Search combines correctly with category, brand, price, and attribute filters.
- Query construction remains parameterized.

### Accessibility

- Compare actions have explicit accessible names including the product name.
- Comparison table/region has a programmatic label and keyboard-accessible horizontal navigation.
- Difference-only state is represented by a real control with visible state.
- Search result updates are announced without stealing focus.

### Performance

- Comparison fetches products in one bounded request for at most four IDs.
- Search v2 must be covered by the catalog k6 suite before release.
- If attribute search causes unacceptable query cost, optimize with targeted indexes before considering an external search service.

---

# Cross-sprint architecture

## Server ownership

Keep the current Nest feature boundary under `server/src/products/`.

Expected responsibilities:

```text
ProductsController
  request parsing and response compatibility

NestProductsService
  category resolution and product business rules

NestProductsRepository
  catalog/search/filter/product reads

ProductAttributesRepository
  product-specific technical values

Taxonomy repository/service (new, focused)
  canonical categories, aliases, category attribute definitions, facet metadata
```

Do not move unrelated order/payment logic into the products module.

## Client ownership

Expected responsibility boundaries:

```text
ShopsPage
  URL/query orchestration and product-result loading

AsideShops / facet components
  present server-provided filters

Comparison context/hook
  local selection state and URL synchronization

ProductComparisonProvider
  one shared selection store mounted above the router; cards, home results,
  shop results, and ProductPage consume the same state

ComparePage
  dedicated comparison presentation

products/api.ts
  catalog/facet/search/compare API contracts
```

Large filter/compare logic should be extracted from route components rather than making `ShopsPage.tsx` or `ProductPage.tsx` significantly larger.

## Error behavior

- Taxonomy/facet metadata failure must not make the product list unusable; degrade to category/brand/price filters.
- Invalid attribute filter values return a safe `400` with the established response shape.
- Invalid comparison product IDs return `400`; missing products return `404` or a deterministic invalid-selection response.
- Mixed-category comparisons return `400` from the server even if the client already prevents them.
- Search failures use the existing product error/loading surface; do not silently convert server errors into empty successful results.

## Documentation updates required with implementation

Update the maintained documentation in the same PRs that change contracts:

```text
README.md
docs/API.md
docs/ARCHITECTURE.md
Wiki/architecture.md
Wiki/index.md
Wiki/concepts/catalog-discovery-and-comparison.md
Wiki/concepts/* as appropriate
server/src/docs/openapi.json
CHANGELOG.md
```

The catalog-specific Wiki concept is the primary owner for taxonomy, facets,
search, and comparison behavior. Remove the obsolete deferred-comparison note
from order-lifecycle documentation as a compatibility cleanup, but do not use
that page as the catalog design owner.

Add a new ADR only if the final implementation materially changes a durable
architectural decision beyond this approved design.

# Test strategy

Use TDD for each independently reviewable behavior.

## Server

Cover at minimum:

- canonical category/alias resolution
- category metadata migration assumptions
- facet metadata aggregation
- text and numeric attribute facet aggregation
- attribute filter validation
- admin category resolution behavior
- batch comparison input validation
- same-category comparison invariant
- deterministic comparison-row ordering
- exact SKU/MPN search priority
- technical attribute search
- combined search + attribute filter behavior

## Client

Cover at minimum:

- URL parsing/serialization for technical facets
- category changes clearing incompatible filters
- dynamic facet rendering by metadata type
- loading/error/fallback facet states
- comparison add/remove/max-four behavior
- mixed-category rejection
- shareable compare URL hydration
- difference-only table behavior
- mobile-accessible comparison overflow container
- Search v2 result integration without regressing existing search controls

## Integration / performance

Extend existing integration and k6 coverage rather than creating a parallel test framework.

Integration tests must create and remove their own category metadata, products,
product attributes, and manufacturer part numbers, or use the repository's
existing isolated fixture helpers. They must not depend on demo:reset, demo
seed ordering, or production/Aiven data. The k6 comparison scenario obtains
two or more IDs from a same-category catalog response and skips the comparison
read when the selected fixture cannot provide them.

Verify:

```text
GET /api/products/facets?category=<slug>
GET /api/products?...attributeFilters=<json>
GET /api/products/compare?ids=<ids>
GET /api/products/search?q=<technical term>
```

Run the existing client/server typecheck, lint, test, build, MySQL integration, migration status, and read-only catalog k6 commands before merge.

# Rollout strategy

## Sprint 1 rollout

1. Apply additive taxonomy migration.
2. Seed/map existing canonical category metadata and aliases.
3. Add category attribute definitions for the current demo catalog.
4. Ship extended facets API.
5. Ship dynamic storefront facets.
6. Tighten admin category selection only after canonical data exists.

If dynamic facets fail, the storefront must continue with the existing category/brand/price filters.

## Sprint 2 rollout

1. Add Search v2 backend matching and focused regression tests.
2. Add comparison batch API.
3. Add comparison selection state and UI entry points.
4. Add `/compare` page.
5. Extend k6 catalog scenarios.

Comparison is additive and can ship independently of existing checkout/order flows.

# Non-goals

These items are explicitly outside Sprint 1–2:

- PC compatibility engine
- PC Builder
- AI shopping assistant
- price-drop/back-in-stock subscriptions
- bundles/frequently-bought-together persistence
- warranty claim/RMA workflow
- item-level returns
- shipment tracking
- trade-in
- external search engines such as Elasticsearch/OpenSearch/Algolia
- semantic/vector search
- taxonomy administration UI
- rewriting order status or payment workflows

# Definition of done

Sprint 1 is done when Digital-E has a stable canonical taxonomy presentation and the storefront can render server-driven technical facets for one selected category while preserving all existing catalog behavior.

Sprint 2 is done when users can compare 2–4 same-category products using typed attributes and search by product identity/specification signals such as SKU, MPN, and technical attribute values without regressing current filters or relevance behavior.
