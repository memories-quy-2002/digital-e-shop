# Digital-E Catalog Discovery & Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Sprint 1 (canonical catalog taxonomy + server-driven technical facets) and Sprint 2 (same-category product comparison + Search v2) without regressing Digital-E's current catalog, checkout, order, recommendation, wishlist, or admin flows.

**Architecture:** Keep `products.category_id` and `product_attributes` as the durable product/value boundaries. Add server-owned taxonomy and category-attribute metadata, expose them through additive NestJS product APIs, and keep the existing `GET /api/products` filter contract backward compatible. On the client, extract URL/filter/compare state into focused utilities/hooks so `ShopsPage`, `ProductCard`, and `ProductPage` remain orchestration/presentation surfaces rather than domain stores.

**Tech Stack:** Node.js 24.20.0, pnpm 12.3.4, NestJS 11, Express 5 adapter, MySQL, Prisma 7 migrations, TypeScript 6, Zod 4, React 19, React Router 7, Axios, Tailwind 4 + existing SCSS/BEM, Vitest 5, Testing Library, k6.

**Spec:** `docs/superpowers/specs/2026-09-11-catalog-discovery-comparison-design.md`

## Global Constraints

- This document is an implementation plan for the revised draft. Do not start
  coding until the user approves both the design and this plan.
- Scope is exactly Sprint 1 and Sprint 2 from the revised spec.
- Digital-E remains a general-electronics store; no PC-only catalog assumptions.
- Preserve existing product IDs and `products.category_id`.
- Preserve existing order-item snapshots; do not rewrite historical order data.
- Existing `GET /api/products` callers without new parameters must behave unchanged.
- Existing `GET /api/products/facets` fields (`categories`, `brands`, `minPrice`, `maxPrice`, `totalProducts`) remain compatible.
- `product_attributes` remains the only per-product typed technical-value store.
- Taxonomy/facet/comparison metadata is server-owned; the client must not hard-code category attribute vocabularies.
- All user-controlled SQL values remain parameterized.
- Do not introduce Elasticsearch, OpenSearch, Algolia, a vector database, or another runtime search dependency.
- Do not introduce a new client data-fetching library.
- Keep current auth, cart, checkout, payment, recommendation, wishlist, review, order, and admin authorization semantics.
- Use the repository's existing Prisma forward-migration workflow; production changes must be compatible with `pnpm prisma:migrate:deploy`.
- Use TDD: write a failing focused test, run it, implement the smallest behavior, run green, then commit.
- Run database integration/performance checks only against the repository's isolated local/CI database, never shared production data.

- The first demo taxonomy is Laptop, PC, Graphics Card, Monitor, Smartphone,
  Headphone, Console, and Camera. Do not require the total active-category count
  to equal this list because legacy categories may remain in the baseline.
- Demo technical facets are valid only when the seed writes matching typed
  product_attributes values. Demo products must also have deterministic MPN
  values for identity-search and comparison verification.
- Never rewrite products.category_id to implement aliases. Resolve a canonical
  category plus its registered legacy category IDs and pass that scope to list,
  facet, search, and comparison queries.
- Add category=<canonical-slug> to the product-list contract while preserving
  categories=... for existing URLs and callers.
- Integration tests must own their catalog fixtures. They must not rely on
  demo:reset, demo seed ordering, Aiven, or production data.

---

# File Structure

## New server files

- `server/src/database/prisma/migrations/20260911100000_catalog_taxonomy_facets/migration.sql`
  - Add category metadata and create alias/attribute-definition tables.
- `server/src/products/catalog-taxonomy.types.ts`
  - Canonical category, alias, attribute-definition, and facet response types.
- `server/src/products/catalog-taxonomy.repository.ts`
  - Read canonical categories, resolve names/slugs/aliases, and aggregate facet metadata.
- `server/src/products/catalog-taxonomy.service.ts`
  - Enforce canonical resolution rules and shape public catalog metadata.
- `server/src/products/__tests__/catalog-taxonomy.service.test.ts`
  - Unit tests for canonical/alias resolution and safe fallback.
- `server/src/products/__tests__/catalog-facets.test.ts`
  - Unit/controller tests for category-specific facet contracts.
- `server/src/products/__tests__/product-comparison.test.ts`
  - Comparison validation/row-shaping tests.
- `server/src/products/__tests__/product-search-v2.test.ts`
  - Search ranking/query-contract tests.
- `server/src/products/__tests__/catalog.integration.test.ts`
  - MySQL integration coverage for taxonomy/facets/search/compare.

## New client files

- client/src/features/products/context/ProductComparisonContext.tsx
  - Shared comparison selection provider mounted above the router.
- `client/src/features/products/catalogFilters.ts`
  - Parse/serialize human-readable shop URL state and translate technical facets to API `attributeFilters`.
- `client/src/features/products/catalogFilters.test.ts`
  - URL/filter state tests.
- `client/src/features/products/components/TechnicalFacetGroup.tsx`
  - Render one text or numeric server-provided technical facet.
- `client/src/features/products/components/TechnicalFacetGroup.test.tsx`
  - Accessible facet interaction tests.
- `client/src/features/products/compare.ts`
  - Pure comparison selection and difference-row helpers.
- `client/src/features/products/compare.test.ts`
  - Max-four, same-category, URL hydration, and difference tests.
- `client/src/features/products/hooks/useProductComparison.ts`
  - Persist active comparison selection and synchronize `/compare?products=...`.
- `client/src/features/products/pages/ComparePage.tsx`
  - Dedicated comparison route.
- `client/src/features/products/pages/ComparePage.test.tsx`
  - Comparison route/UI tests.
- `client/src/styles/pages/_compare.scss`
  - Comparison-only responsive/horizontal-overflow styling.

## Existing server files to modify

- server/src/products/product-attributes.repository.ts
- `server/src/database/prisma/schema.prisma`
- `server/src/database/seeders/demoSeedData.js`
- `server/src/database/seeders/seedDemo.js`
- `server/src/database/seeders/verifyDemo.js`
- `server/src/products/products.module.ts`
- `server/src/products/products.controller.ts`
- `server/src/products/products.service.ts`
- `server/src/products/products.repository.ts`
- `server/src/products/products.types.ts`
- `server/src/products/products.validator.ts`
- `server/src/products/__tests__/products.controller.test.ts`
- `server/src/products/__tests__/products.service.test.ts`
- `server/src/docs/openapi.json`
- `server/test/k6-catalog-test.js`

## Existing client files to modify

- client/src/app/providers.tsx
- client/src/components/common/PaginatedItems.tsx
- client/src/pages/HomePage.tsx
- `client/src/features/products/api.ts`
- `client/src/features/products/api.test.ts`
- `client/src/pages/ShopsPage.tsx`
- `client/src/pages/__tests__/ShopsPage.filters.test.ts`
- `client/src/components/common/AsideShops.tsx`
- `client/src/components/common/ProductCard.tsx`
- `client/src/components/common/ProductItem.tsx`
- `client/src/components/common/ShopsItem.tsx`
- `client/src/components/common/__tests__/ProductCard.test.tsx`
- `client/src/features/products/pages/ProductPage.tsx`
- `client/src/routes/router.tsx`
- `client/src/styles/pages/_shops.scss`
- `client/src/styles/main.scss` or the existing stylesheet aggregator that imports page styles
- `client/src/features/admin/components/ProductForm.tsx`
- `client/src/features/admin/pages/AdminAddProductPage.tsx`
- `client/src/features/admin/pages/AdminProductPage.tsx`
- focused existing admin product-form tests
- `client/src/i18n/en.ts`
- `client/src/i18n/vi.ts`

## Documentation to modify

- Wiki/concepts/catalog-discovery-and-comparison.md
- `README.md`
- `CHANGELOG.md`
- `docs/API.md`
- `docs/ARCHITECTURE.md`
- `Wiki/index.md`
- `Wiki/architecture.md`
- `Wiki/concepts/order-lifecycle-and-support.md`

---

# Sprint 1 — Canonical Taxonomy + Dynamic Technical Facets

### Task 1: Add the forward-only taxonomy/facet schema

**Files:**
- Create: `server/src/database/prisma/migrations/20260911100000_catalog_taxonomy_facets/migration.sql`
- Modify: `server/src/database/prisma/schema.prisma`
- Test/verify: Prisma validation and migration status against isolated MySQL

**Interfaces:**
- Produces category columns: `slug`, `catalog_group`, `is_active`, `sort_order`.
- Produces table `category_aliases(alias_slug, alias_name, category_id)`.
- Produces table `category_attribute_definitions(category_id, attribute_key, label, value_type, unit, filterable, comparable, facet_order, comparison_order)`.
- Preserves the existing `products.category_id -> categories.id` relation.

- [ ] **Step 0: Preflight legacy category invariants**

Before writing the migration, query the isolated database for duplicate category
names, duplicate slugs if the metadata columns already exist, and all current
category IDs referenced by products. The migration must fail clearly or provide
an explicit mapping if names collide; it must never guess a product category.

- [ ] **Step 1: Write the migration SQL with additive columns and metadata tables**

Use a migration that is safe for the current legacy `categories` rows:

```sql
ALTER TABLE `categories`
    ADD COLUMN `slug` VARCHAR(120) NULL,
    ADD COLUMN `catalog_group` VARCHAR(80) NULL,
    ADD COLUMN `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    ADD COLUMN `sort_order` INT NOT NULL DEFAULT 100;

CREATE TABLE `category_aliases` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `alias_slug` VARCHAR(120) NOT NULL,
    `alias_name` VARCHAR(255) NOT NULL,
    `category_id` INT NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_category_aliases_slug` (`alias_slug`),
    UNIQUE KEY `uq_category_aliases_name` (`alias_name`),
    KEY `category_aliases_category_id_idx` (`category_id`),
    CONSTRAINT `fk_category_aliases_category`
        FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`)
        ON DELETE CASCADE ON UPDATE RESTRICT
);

CREATE TABLE `category_attribute_definitions` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `category_id` INT NOT NULL,
    `attribute_key` VARCHAR(120) NOT NULL,
    `label` VARCHAR(160) NOT NULL,
    `value_type` VARCHAR(16) NOT NULL,
    `unit` VARCHAR(32) NULL,
    `filterable` TINYINT(1) NOT NULL DEFAULT 1,
    `comparable` TINYINT(1) NOT NULL DEFAULT 1,
    `facet_order` INT NOT NULL DEFAULT 100,
    `comparison_order` INT NOT NULL DEFAULT 100,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_category_attribute_definition` (`category_id`, `attribute_key`),
    KEY `category_attribute_filter_idx` (`category_id`, `filterable`, `facet_order`),
    KEY `category_attribute_compare_idx` (`category_id`, `comparable`, `comparison_order`),
    CONSTRAINT `fk_category_attribute_definition_category`
        FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`)
        ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT `chk_category_attribute_value_type`
        CHECK (`value_type` IN ('text', 'number'))
);
```

Backfill canonical rows with unique slugs:

```sql
UPDATE categories SET slug = 'laptops', catalog_group = 'Computers', sort_order = 10 WHERE name = 'Laptop';
UPDATE categories SET slug = 'desktops', catalog_group = 'Computers', sort_order = 20 WHERE name = 'Desktop';
UPDATE categories SET slug = 'pc-and-peripherals', catalog_group = 'Computers', sort_order = 30 WHERE name = 'PC';
UPDATE categories SET slug = 'graphics-cards', catalog_group = 'Computers', sort_order = 40 WHERE name = 'Graphics Card';
UPDATE categories SET slug = 'monitors', catalog_group = 'Displays', sort_order = 10 WHERE name = 'Monitor';
UPDATE categories SET slug = 'smartphones', catalog_group = 'Mobile', sort_order = 10 WHERE name = 'Smartphone';
UPDATE categories SET slug = 'headphones', catalog_group = 'Audio', sort_order = 10 WHERE name = 'Headphone';
UPDATE categories SET slug = 'speakers', catalog_group = 'Audio', sort_order = 20 WHERE name = 'Speaker';
UPDATE categories SET slug = 'consoles', catalog_group = 'Gaming', sort_order = 10 WHERE name = 'Console';
UPDATE categories SET slug = 'cameras', catalog_group = 'Cameras', sort_order = 10 WHERE name = 'Camera';

UPDATE categories
SET slug = CONCAT('legacy-', id), is_active = 0, sort_order = 1000
WHERE slug IS NULL;

ALTER TABLE `categories`
    MODIFY COLUMN `slug` VARCHAR(120) NOT NULL,
    ADD UNIQUE KEY `uq_categories_slug` (`slug`),
    ADD KEY `categories_navigation_idx` (`is_active`, `catalog_group`, `sort_order`);
```

Create aliases only when their canonical target exists:

```sql
INSERT INTO category_aliases (alias_slug, alias_name, category_id)
SELECT 'phone', 'Phone', id FROM categories WHERE slug = 'smartphones';

INSERT INTO category_aliases (alias_slug, alias_name, category_id)
SELECT 'gpu', 'GPU', id FROM categories WHERE slug = 'graphics-cards';
```

Do not delete legacy category rows in this migration.

- [ ] **Step 2: Mirror the migration in Prisma schema**

Add fields/models with the exact mapped column/table names:

```prisma
model Category {
  id           Int      @id @default(autoincrement())
  name         String   @db.VarChar(255)
  slug         String   @unique @db.VarChar(120)
  catalogGroup String?  @map("catalog_group") @db.VarChar(80)
  isActive     Boolean  @default(true) @map("is_active") @db.TinyInt
  sortOrder    Int      @default(100) @map("sort_order")

  aliases              CategoryAlias[]
  attributeDefinitions CategoryAttributeDefinition[]

  @@map("categories")
}

model CategoryAlias {
  id         Int      @id @default(autoincrement())
  aliasSlug  String   @unique @map("alias_slug") @db.VarChar(120)
  aliasName  String   @unique @map("alias_name") @db.VarChar(255)
  categoryId Int      @map("category_id")
  category   Category @relation(fields: [categoryId], references: [id], onDelete: Cascade)

  @@index([categoryId], map: "category_aliases_category_id_idx")
  @@map("category_aliases")
}

model CategoryAttributeDefinition {
  id              Int      @id @default(autoincrement())
  categoryId      Int      @map("category_id")
  attributeKey    String   @map("attribute_key") @db.VarChar(120)
  label           String   @db.VarChar(160)
  valueType       String   @map("value_type") @db.VarChar(16)
  unit            String?  @db.VarChar(32)
  filterable      Boolean  @default(true) @db.TinyInt
  comparable      Boolean  @default(true) @db.TinyInt
  facetOrder      Int      @default(100) @map("facet_order")
  comparisonOrder Int      @default(100) @map("comparison_order")
  category        Category @relation(fields: [categoryId], references: [id], onDelete: Cascade)

  @@unique([categoryId, attributeKey], map: "uq_category_attribute_definition")
  @@index([categoryId, filterable, facetOrder], map: "category_attribute_filter_idx")
  @@index([categoryId, comparable, comparisonOrder], map: "category_attribute_compare_idx")
  @@map("category_attribute_definitions")
}
```

If the existing `Category` model has other relations, retain them unchanged.

- [ ] **Step 3: Run schema validation before touching seed/application code**

Run:

```bash
pnpm --dir server prisma:format
pnpm --dir server prisma:validate
```

Expected: both commands succeed.

- [ ] **Step 4: Apply migration to the isolated local database**

Run the repository's normal isolated DB setup/migration path, then:

```bash
pnpm --dir server prisma:migrate:status
```

Expected: `20260911100000_catalog_taxonomy_facets` is applied and there are no pending migrations.

- [ ] **Step 5: Inspect data invariants with SQL**

Against the isolated DB, verify:

```sql
SELECT id, name, slug, catalog_group, is_active, sort_order
FROM categories
ORDER BY is_active DESC, catalog_group, sort_order, id;

SELECT alias_slug, alias_name, category_id
FROM category_aliases
ORDER BY alias_slug;
```

Expected: canonical rows have readable slugs/groups; every row has a unique
slug; legacy rows are retained. Rows mapped as compatibility aliases may remain
referenced by products and must be included by the category-scope resolver even
if their navigation metadata is inactive.

- [ ] **Step 6: Commit**

```bash
git add server/src/database/prisma/migrations/20260911100000_catalog_taxonomy_facets/migration.sql \
        server/src/database/prisma/schema.prisma
git commit -m "feat: add catalog taxonomy metadata"
```

---

### Task 2: Make the demo seed own canonical taxonomy and attribute definitions

**Files:**
- Modify: `server/src/database/seeders/demoSeedData.js`
- Modify: `server/src/database/seeders/seedDemo.js`
- Modify: `server/src/database/seeders/verifyDemo.js`

**Interfaces:**
- Consumes Task 1 schema.
- Produces deterministic canonical metadata and category attribute definitions for current demo products.
- Keeps product values in `product_attributes`.

- [ ] **Step 1: Add taxonomy metadata to the demo seed plan**

Extend `DEMO_SEED_PLAN` with explicit metadata rather than deriving taxonomy from category spelling:

```js
taxonomy: [
    { name: "Laptop", slug: "laptops", group: "Computers", sortOrder: 10 },
    { name: "PC", slug: "pc-and-peripherals", group: "Computers", sortOrder: 30 },
    { name: "Graphics Card", slug: "graphics-cards", group: "Computers", sortOrder: 40 },
    { name: "Monitor", slug: "monitors", group: "Displays", sortOrder: 10 },
    { name: "Smartphone", slug: "smartphones", group: "Mobile", sortOrder: 10 },
    { name: "Headphone", slug: "headphones", group: "Audio", sortOrder: 10 },
    { name: "Console", slug: "consoles", group: "Gaming", sortOrder: 10 },
    { name: "Camera", slug: "cameras", group: "Cameras", sortOrder: 10 },
],
categoryAliases: [
    { aliasSlug: "phone", aliasName: "Phone", categoryName: "Smartphone" },
    { aliasSlug: "gpu", aliasName: "GPU", categoryName: "Graphics Card" },
],
```

Add category definitions matching real current demo attributes. For example:

```js
categoryAttributeDefinitions: {
    Laptop: [
        { key: "ram_gb", label: "Memory", type: "number", unit: "GB", filterable: true, comparable: true, facetOrder: 10, comparisonOrder: 20 },
        { key: "storage_gb", label: "Storage", type: "number", unit: "GB", filterable: true, comparable: true, facetOrder: 20, comparisonOrder: 30 },
        { key: "display_type", label: "Display type", type: "text", unit: null, filterable: true, comparable: true, facetOrder: 30, comparisonOrder: 10 },
    ],
    Monitor: [
        { key: "resolution", label: "Resolution", type: "text", unit: null, filterable: true, comparable: true, facetOrder: 10, comparisonOrder: 10 },
        { key: "refresh_rate_hz", label: "Refresh rate", type: "number", unit: "Hz", filterable: true, comparable: true, facetOrder: 20, comparisonOrder: 20 },
    ],
    "Graphics Card": [
        { key: "vram_gb", label: "VRAM", type: "number", unit: "GB", filterable: true, comparable: true, facetOrder: 10, comparisonOrder: 10 },
        { key: "memory_type", label: "Memory type", type: "text", unit: null, filterable: true, comparable: true, facetOrder: 20, comparisonOrder: 20 },
    ],
}
```

Only define keys that the demo seed also writes into `product_attributes`. Do not invent a filter definition without values in the same seed graph.

- Only define keys that the demo seed also writes into product_attributes. Do not
  invent a filter definition without values in the same seed graph. Each product
  definition that participates in technical facets must carry an attributes
  collection with the exact key, type, unit, and value used by the definition.
  Each demo product used by identity-search or comparison must also carry a
  deterministic manufacturerPartNumber.

- [ ] **Step 2: Write a failing seed validation check**

Extend `validateDemoSeedPlan()` so it rejects mismatched attribute definitions:

```js
for (const [categoryName, definitions] of Object.entries(plan.categoryAttributeDefinitions)) {
    if (!plan.taxonomy.some((item) => item.name === categoryName)) {
        throw new Error(`Unknown category definition: ${categoryName}`);
    }

    const keys = new Set();
    for (const definition of definitions) {
        if (keys.has(definition.key)) {
            throw new Error(`Duplicate attribute definition: ${categoryName}.${definition.key}`);
        }
        keys.add(definition.key);
        if (!["text", "number"].includes(definition.type)) {
            throw new Error(`Invalid attribute type: ${categoryName}.${definition.key}`);
        }
    }
}
```

Also validate that every definition key has at least one product value in the
same category, that the product value type and unit match the definition, that
no definition is duplicated, and that all identity-search products have a
non-empty unique manufacturerPartNumber. The validation must inspect the seed
plan itself before any database write.

Run the focused seed validation path used by the current seed tests/verification.

Expected before implementing seed writes: validation can pass, but `demo:verify` fails because metadata rows are absent.

- [ ] **Step 3: Seed/update canonical category metadata**

In `seedDemo.js`, after resolving category IDs:

```js
for (const item of plan.taxonomy) {
    const categoryId = categoryIds.get(item.name);
    await connection.query(
        `UPDATE categories
         SET slug = ?, catalog_group = ?, is_active = 1, sort_order = ?
         WHERE id = ?`,
        [item.slug, item.group, item.sortOrder, categoryId],
    );
}
```

Upsert aliases using parameterized values and the already-resolved canonical category ID.

- [ ] **Step 4: Seed category attribute definitions transactionally**

Use `INSERT ... ON DUPLICATE KEY UPDATE`:

```js
await connection.query(
    `INSERT INTO category_attribute_definitions
        (category_id, attribute_key, label, value_type, unit, filterable, comparable, facet_order, comparison_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
        label = VALUES(label),
        value_type = VALUES(value_type),
        unit = VALUES(unit),
        filterable = VALUES(filterable),
        comparable = VALUES(comparable),
        facet_order = VALUES(facet_order),
        comparison_order = VALUES(comparison_order)`,
    [
        categoryId,
        definition.key,
        definition.label,
        definition.type,
        definition.unit,
        definition.filterable ? 1 : 0,
        definition.comparable ? 1 : 0,
        definition.facetOrder,
        definition.comparisonOrder,
    ],
);
```

Keep this inside the existing seed transaction.

- [ ] **Step 4a: Replace typed attributes idempotently after demo cleanup**

After the existing demo-row cleanup has finished and demo product IDs are
known, delete product_attributes for those demo product IDs and insert the
planned typed values with parameterized statements. This prevents stale
attributes from deleted or changed demo products from creating undeclared
facets. Upsert manufacturer part numbers in the same product write path and
keep the operation inside the existing seed transaction.

The write order must be: resolve categories, upsert products, remove stale demo
rows, then replace product_attributes and seed definitions/aliases before the
final verification query. Do not rely on free-form specifications for this
step.

- [ ] **Step 5: Extend `verifyDemo.js` with deterministic checks**

Verify:

```js
const activeCategories = await query(connection, `
    SELECT COUNT(*) AS total
    FROM categories
    WHERE is_active = 1 AND slug NOT LIKE 'legacy-%'
`);

const definitions = await query(connection, `
    SELECT COUNT(*) AS total
    FROM category_attribute_definitions
    WHERE filterable = 1
`);

for (const taxonomyItem of DEMO_SEED_PLAN.taxonomy) {
    const rows = await query(connection, "SELECT id, slug, catalog_group, is_active FROM categories WHERE name = ?", [taxonomyItem.name]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].slug, taxonomyItem.slug);
    assert.equal(rows[0].catalog_group, taxonomyItem.group);
    assert.equal(Number(rows[0].is_active), 1);
}
assert.ok(Number(definitions[0].total) > 0);
```

Also verify every definition category exists and every seeded alias resolves to
an active canonical category. For each definition, query at least one matching
product_attributes row and assert key, value_type, unit, and a non-null value.
For each demo product used by Search v2, assert its manufacturer part number is
stable and unique. Do not assert that unrelated legacy categories disappeared.

- [ ] **Step 6: Run demo verification**

Run:

```bash
pnpm --dir server prisma:seed
pnpm --dir server demo:verify
```

Expected: both succeed against the isolated local demo DB.

- [ ] **Step 7: Commit**

```bash
git add server/src/database/seeders/demoSeedData.js \
        server/src/database/seeders/seedDemo.js \
        server/src/database/seeders/verifyDemo.js
git commit -m "feat: seed catalog taxonomy definitions"
```

---

### Task 3: Add a focused taxonomy repository/service boundary

**Files:**
- Create: `server/src/products/catalog-taxonomy.types.ts`
- Create: `server/src/products/catalog-taxonomy.repository.ts`
- Create: `server/src/products/catalog-taxonomy.service.ts`
- Create: `server/src/products/__tests__/catalog-taxonomy.service.test.ts`
- Modify: `server/src/products/products.module.ts`

**Interfaces:**
- Produces `CatalogCategory`, `CatalogAttributeDefinition`, `CatalogAttributeFacet`.
- Produces `CatalogTaxonomyRepository.listActiveCategories()`.
- Produces `CatalogTaxonomyRepository.resolveCategory(identifier)`.
- Produces `CatalogTaxonomyService.resolveActiveCategory(identifier)`.
- Later tasks use this service from controllers/product writes.

- The repository/service boundary must expose an internal category scope:
  category (the active canonical row), productCategoryIds (canonical ID plus
  existing legacy IDs whose names match registered aliases), and aliasNames.
  Product queries consume productCategoryIds explicitly; they never rewrite a
  product category to make an alias resolve.

- Define a CatalogCategoryScope type with canonical category metadata,
  productCategoryIds, and aliasNames. CatalogCategory remains the public
  metadata shape; the scope is the internal return value used by product
  queries and comparison validation.

- [ ] **Step 1: Define exact public types**

```ts
export type CatalogCategory = {
    id: number;
    name: string;
    slug: string;
    group: string | null;
    sortOrder: number;
};

export type CatalogAttributeDefinition = {
    key: string;
    label: string;
    type: "text" | "number";
    unit: string | null;
    filterable: boolean;
    comparable: boolean;
    facetOrder: number;
    comparisonOrder: number;
};

export type TextCatalogFacet = CatalogAttributeDefinition & {
    type: "text";
    values: Array<{ value: string; count: number }>;
};

export type NumberCatalogFacet = CatalogAttributeDefinition & {
    type: "number";
    min: number;
    max: number;
};

export type CatalogAttributeFacet = TextCatalogFacet | NumberCatalogFacet;
```

- [ ] **Step 2: Write failing service tests**

Test canonical slug, canonical name, alias slug/name, inactive rejection, and
unknown null. Scope-returning cases must assert both the canonical public
category and the complete productCategoryIds list.

```ts
it.each([
    ["laptops", { id: 2, name: "Laptop", slug: "laptops", group: "Computers", sortOrder: 10 }],
    ["Laptop", { id: 2, name: "Laptop", slug: "laptops", group: "Computers", sortOrder: 10 }],
    ["phone", { id: 4, name: "Smartphone", slug: "smartphones", group: "Mobile", sortOrder: 10 }],
    ["Phone", { id: 4, name: "Smartphone", slug: "smartphones", group: "Mobile", sortOrder: 10 }],
])("resolves %s to the active canonical category", async (identifier, expected) => {
    repository.resolveCategory.mockResolvedValue(expected);
    await expect(service.resolveActiveCategory(identifier)).resolves.toEqual(expected);
});

it("returns null when no active canonical category resolves", async () => {
    repository.resolveCategory.mockResolvedValue(null);
    await expect(service.resolveActiveCategory("unknown")).resolves.toBeNull();
});
```

Run:

```bash
pnpm --dir server test -- --run src/products/__tests__/catalog-taxonomy.service.test.ts
```

Expected: FAIL because the service/repository do not exist.

- [ ] **Step 3: Implement repository category listing**

Use parameterized queries and explicit aliases:

```ts
async listActiveCategories(): Promise<CatalogCategory[]> {
    const [rows] = await pool.promise().query<Array<{
        id: number;
        name: string;
        slug: string;
        catalog_group: string | null;
        sort_order: number;
    }>>(
        `SELECT id, name, slug, catalog_group, sort_order
         FROM categories
         WHERE is_active = 1
         ORDER BY catalog_group ASC, sort_order ASC, name ASC`,
    );

    return rows.map((row) => ({
        id: Number(row.id),
        name: row.name,
        slug: row.slug,
        group: row.catalog_group,
        sortOrder: Number(row.sort_order),
    }));
}
```

- [ ] **Step 4: Implement alias-aware resolution**

One bounded query can resolve name/slug/alias:

```sql
SELECT c.id, c.name, c.slug, c.catalog_group, c.sort_order
FROM categories c
LEFT JOIN category_aliases ca ON ca.category_id = c.id
WHERE c.is_active = 1
  AND (
      LOWER(c.slug) = LOWER(?)
      OR LOWER(c.name) = LOWER(?)
      OR LOWER(ca.alias_slug) = LOWER(?)
      OR LOWER(ca.alias_name) = LOWER(?)
  )
ORDER BY
  CASE
    WHEN LOWER(c.slug) = LOWER(?) THEN 0
    WHEN LOWER(c.name) = LOWER(?) THEN 1
    ELSE 2
  END
LIMIT 1
```

Bind the identifier for every placeholder; do not interpolate it.

If the legacy alias category row is inactive, resolve it through its alias name
only after confirming that the alias target is an active canonical category.
Return the canonical row for public metadata and include the legacy row ID only
in the internal productCategoryIds scope.

- [ ] **Step 4a: Resolve the complete category scope**

Add a repository method that returns the canonical category and the compatible
legacy category IDs in one bounded, parameterized read. The resolver must
distinguish an inactive canonical category from an inactive legacy alias row:
the former is rejected for navigation, while the latter may remain in
productCategoryIds for compatibility when its alias targets an active
canonical category.

Add tests for the existing Phone and GPU category rows, if present, proving
that resolving smartphones/phone and graphics-cards/gpu returns the canonical
category plus the legacy IDs without changing products.category_id.

- [ ] **Step 5: Implement the service as a thin domain boundary**

resolveActiveCategory returns CatalogCategoryScope or null. The controller
serializes only scope.category in public facet/category responses and passes
scope.productCategoryIds to repository queries.

```ts
@Injectable()
export class CatalogTaxonomyService {
    constructor(private readonly repository: CatalogTaxonomyRepository) {}

    listActiveCategories() {
        return this.repository.listActiveCategories();
    }

    resolveActiveCategory(identifier: string | null | undefined) {
        const normalized = String(identifier ?? "").trim();
        if (!normalized) return Promise.resolve(null);
        return this.repository.resolveCategory(normalized);
    }
}
```

- [ ] **Step 6: Register repository/service in `ProductsModule`**

Add both to `providers` and export the service only if another existing feature genuinely needs it. Do not create a new Nest module for two tightly related product-catalog classes.

- [ ] **Step 7: Run tests and typecheck**

```bash
pnpm --dir server test -- --run src/products/__tests__/catalog-taxonomy.service.test.ts
pnpm --dir server typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/src/products/catalog-taxonomy.types.ts \
        server/src/products/catalog-taxonomy.repository.ts \
        server/src/products/catalog-taxonomy.service.ts \
        server/src/products/__tests__/catalog-taxonomy.service.test.ts \
        server/src/products/products.module.ts
git commit -m "feat: add catalog taxonomy service"
```

---

### Task 4: Extend facets with category-specific technical metadata

**Files:**
- Modify: `server/src/products/catalog-taxonomy.repository.ts`
- Modify: `server/src/products/catalog-taxonomy.service.ts`
- Modify: `server/src/products/products.controller.ts`
- Modify: `server/src/products/products.repository.ts`
- Create: `server/src/products/__tests__/catalog-facets.test.ts`
- Modify: `server/src/products/__tests__/products.controller.test.ts`

**Interfaces:**
- Adds `GET /api/products/categories`.
- Extends `GET /api/products/facets?category=<slug-or-name>`.
- Keeps the existing `facets.categories: string[]` compatibility field.
- Adds `facets.category` and `facets.attributeFacets`.

- Base facets must accept an optional productCategoryIds scope. When a category
  is selected, categories, brands, prices, total, and technical aggregates all
  use the same ID list. The no-category call keeps the current global query.
- Definition and attribute aggregate queries must use a trusted placeholder
  list generated from the resolved scope IDs; never interpolate an identifier
  supplied by the request.

- [ ] **Step 1: Write failing controller/service contract tests**

Test global fallback and selected-category response:

```ts
it("keeps global facets and adds empty attribute facets without a category", async () => {
    repository.getProductFacets.mockResolvedValue({
        categories: ["Laptop"],
        brands: ["Dell"],
        minPrice: 100,
        maxPrice: 2000,
        totalProducts: 10,
    });
    taxonomy.listActiveCategories.mockResolvedValue([]);
    taxonomy.getFacetsForCategory.mockResolvedValue([]);

    const result = await controller.getProductFacets(undefined);

    expect(result.facets.attributeFacets).toEqual([]);
    expect(result.facets.category).toBeNull();
    expect(result.facets.categories).toEqual(["Laptop"]);
});
```

And:

```ts
it("returns server-driven technical facets for one canonical category", async () => {
    const result = await controller.getProductFacets("monitors");
    expect(result.facets.category?.slug).toBe("monitors");
    expect(result.facets.attributeFacets).toEqual(
        expect.arrayContaining([
            expect.objectContaining({ key: "refresh_rate_hz", type: "number", unit: "Hz" }),
        ]),
    );
});
```

Run:

```bash
pnpm --dir server test -- --run src/products/__tests__/catalog-facets.test.ts
```

Expected: FAIL.

- [ ] **Step 2: Add a category list endpoint**

In `ProductsController`:

```ts
@Get("categories")
async getCatalogCategories() {
    return {
        categories: await this.catalogTaxonomyService.listActiveCategories(),
        msg: "Get catalog categories successfully",
    };
}
```

Inject `CatalogTaxonomyService` into the controller.

- [ ] **Step 3: Add repository method for definition rows**

```ts
async listAttributeDefinitions(categoryIds: number[], mode: "filter" | "compare") {
    const flagColumn = mode === "filter" ? "filterable" : "comparable";
    const orderColumn = mode === "filter" ? "facet_order" : "comparison_order";

    const [rows] = await pool.promise().query(
        `SELECT attribute_key, label, value_type, unit,
                filterable, comparable, facet_order, comparison_order
         FROM category_attribute_definitions
         WHERE category_id IN (?, ...) AND ${flagColumn} = 1
         ORDER BY ${orderColumn} ASC, attribute_key ASC`,
        [categoryId],
    );
    return rows;
}
```

`flagColumn` and `orderColumn` are internal enum-controlled constants, not user input.

- The definition query must use category_id IN with one placeholder per
  resolved scope ID. The flag and order column names remain internal
  enum-controlled constants.

- [ ] **Step 4: Aggregate text facets in one grouped query**

For all filterable text definitions in the selected category:

```sql
SELECT
    pa.attribute_key,
    pa.text_value AS value,
    COUNT(*) AS total
FROM product_attributes pa
JOIN products p ON p.id = pa.product_id
WHERE p.category_id IN (?, ...)
  AND p.stock >= 0
  AND pa.filterable = 1
  AND pa.value_type = 'text'
  AND pa.text_value IS NOT NULL
GROUP BY pa.attribute_key, pa.text_value
ORDER BY pa.attribute_key, total DESC, pa.text_value ASC
```

Group rows by key in TypeScript; do not execute one query per definition.

- [ ] **Step 5: Aggregate numeric facets in one grouped query**

```sql
SELECT
    pa.attribute_key,
    MIN(pa.number_value) AS min_value,
    MAX(pa.number_value) AS max_value
FROM product_attributes pa
JOIN products p ON p.id = pa.product_id
WHERE p.category_id IN (?, ...)
  AND p.stock >= 0
  AND pa.filterable = 1
  AND pa.value_type = 'number'
  AND pa.number_value IS NOT NULL
GROUP BY pa.attribute_key
```

Merge aggregates only with configured definitions so undeclared values do not become UI facets.

- [ ] **Step 6: Extend `getProductFacets` controller behavior**

Change signature to:

```ts
@Get("facets")
async getProductFacets(@Query("category") category: string | undefined) {
```

Behavior:

```ts
const resolvedCategory = await this.catalogTaxonomyService.resolveActiveCategory(category);

const [baseFacets, activeCategories] = await Promise.all([
    this.productsRepository.getProductFacets(resolvedCategory?.productCategoryIds),
    this.catalogTaxonomyService.listActiveCategories(),
]);

return {
    facets: {
        ...baseFacets,
        category: resolvedCategory?.category ?? null,
        categoryOptions: activeCategories,
        attributeFacets: resolvedCategory
            ? await this.catalogTaxonomyService.getFilterFacets(resolvedCategory.productCategoryIds)
            : [],
    },
    msg: "Get product facets successfully",
};
```

Unknown category degrades to `category: null` and `attributeFacets: []`.

Place all static routes such as categories and facets before the existing
product-id route. A known category passes productCategoryIds to both the base
facet repository and technical-facet aggregation; an unknown category falls
back to global facets without inventing metadata.

- [ ] **Step 7: Run focused tests**

```bash
pnpm --dir server test -- --run src/products/__tests__/catalog-facets.test.ts src/products/__tests__/products.controller.test.ts
pnpm --dir server typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/src/products/catalog-taxonomy.repository.ts \
        server/src/products/catalog-taxonomy.service.ts \
        server/src/products/products.controller.ts \
        server/src/products/products.repository.ts \
        server/src/products/__tests__/catalog-facets.test.ts \
        server/src/products/__tests__/products.controller.test.ts
git commit -m "feat: expose dynamic catalog facets"
```

---

### Task 5: Canonicalize product writes and stop silent category proliferation

**Files:**
- Modify: `server/src/products/products.service.ts`
- Modify: `server/src/products/products.controller.ts`
- Modify: `server/src/products/__tests__/products.service.test.ts`
- Modify: `client/src/features/products/api.ts`
- Modify: `client/src/features/products/api.test.ts`
- Modify: `client/src/features/admin/components/ProductForm.tsx`
- Modify: `client/src/features/admin/pages/AdminAddProductPage.tsx`
- Modify: `client/src/features/admin/pages/AdminProductPage.tsx`
- Test: focused existing admin product tests

**Interfaces:**
- Product create/update accepts a category identifier but resolves it to an active canonical category.
- Unknown categories return `400`; they are not auto-created.
- Client uses `fetchCatalogCategories(): Promise<CatalogCategory[]>`.

- The service must stop calling the current auto-create category helper for
  product writes. Resolve the submitted value through the taxonomy service,
  persist only the canonical category id, and keep the category scope logic
  separate from write-time identity selection.

- [ ] **Step 1: Write failing server tests for unknown and alias category writes**

Add cases:

```ts
it("rejects product creation when category does not resolve canonically", async () => {
    taxonomy.resolveActiveCategory.mockResolvedValue(null);

    await expect(service.addSingleProductService(validInput, file))
        .rejects.toMatchObject({ statusCode: 400, message: "Unknown or inactive category" });
});

it("uses the canonical category id when an alias is submitted", async () => {
    taxonomy.resolveActiveCategory.mockResolvedValue({
        id: 4,
        name: "Smartphone",
        slug: "smartphones",
        group: "Mobile",
        sortOrder: 10,
    });

    await service.addSingleProductService({ ...validInput, category: "Phone" }, file);

    expect(transaction.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO products"),
        expect.arrayContaining([4]),
    );
});
```

Run:

```bash
pnpm --dir server test -- --run src/products/__tests__/products.service.test.ts
```

Expected: FAIL.

- [ ] **Step 2: Replace category `ensureNamedId` usage only**

Keep brand behavior unchanged. Add:

```ts
private async requireCategory(identifier: string) {
    const category = await this.catalogTaxonomyService.resolveActiveCategory(identifier);
    if (!category) {
        throw Object.assign(new Error("Unknown or inactive category"), { statusCode: 400 });
    }
    return category;
}
```

Use `category.id` for inserts/updates instead of `ensureNamedId("categories", ...)`.

Do not remove `ensureNamedId` for brands in this task.

- [ ] **Step 3: Add client API type and fetcher**

In `client/src/features/products/api.ts`:

```ts
export type CatalogCategory = {
    id: number;
    name: string;
    slug: string;
    group: string | null;
    sortOrder: number;
};

export async function fetchCatalogCategories(): Promise<CatalogCategory[]> {
    const response = await axios.get("/api/products/categories");
    return Array.isArray(response.data?.categories) ? response.data.categories : [];
}
```

Add a focused API test that mocks the response and asserts normalization/fallback.

- [ ] **Step 4: Replace free-form normal admin category entry with canonical selection**

`ProductForm` should receive:

```ts
catalogCategories: CatalogCategory[];
categoriesStatus: "loading" | "ready" | "error";
```

Render grouped `<select>`/existing project select component by `group`, with `value` set to canonical `name` (to preserve current request payload shape).

Error behavior: if category metadata fails, disable product submission and show a retryable category-loading error; do not fall back to arbitrary free text.

- [ ] **Step 5: Load categories in add/edit pages**

Use `fetchCatalogCategories()` on page load and pass results into `ProductForm`. Preserve all current product image/attribute/warranty behavior.

- [ ] **Step 6: Run server and client focused tests**

```bash
pnpm --dir server test -- --run src/products/__tests__/products.service.test.ts
pnpm --dir client test -- --run src/features/products/api.test.ts
pnpm --dir client test -- --run src/features/admin
```

Expected: PASS for focused suites.

- [ ] **Step 7: Commit**

```bash
git add server/src/products/products.service.ts \
        server/src/products/products.controller.ts \
        server/src/products/__tests__/products.service.test.ts \
        client/src/features/products/api.ts \
        client/src/features/products/api.test.ts \
        client/src/features/admin/components/ProductForm.tsx \
        client/src/features/admin/pages/AdminAddProductPage.tsx \
        client/src/features/admin/pages/AdminProductPage.tsx
git commit -m "feat: require canonical product categories"
```

---

### Task 6: Extract human-readable shop URL and technical-filter translation

**Files:**
- Create: `client/src/features/products/catalogFilters.ts`
- Create: `client/src/features/products/catalogFilters.test.ts`
- Modify: `client/src/pages/__tests__/ShopsPage.filters.test.ts`

**Interfaces:**
- Produces `ShopFilters`.
- Produces `parseShopFilters(search, fallbackPriceRange)`.
- Produces `serializeShopFilters(filters)`.
- Produces `toAttributeFilters(filters, facets)` for backend JSON.
- Uses one canonical `category` slug for technical facets while retaining legacy multi-category parsing compatibility.

- The canonical category state must be serialized as category=<slug> and sent
  to both product-list and facets requests. Keep legacyCategories separate so
  old categories= URLs remain readable and functional. Do not translate a
  canonical category into a guessed display name on the client.

- [ ] **Step 1: Define exact state types**

```ts
export type TechnicalFilterValue =
    | { kind: "text"; values: string[] }
    | { kind: "number"; min: number; max?: number };

export type ShopFilters = {
    term: string;
    category: string | null;
    legacyCategories: string[];
    brands: string[];
    priceRange: [number, number];
    sortBy: "relevance" | "price-asc" | "price-desc" | "rating-desc";
    technical: Record<string, TechnicalFilterValue>;
};
```

- [ ] **Step 2: Write failing parse/serialize tests**

Examples:

```ts
it("round-trips canonical category and technical filters", () => {
    const filters: ShopFilters = {
        term: "oled",
        category: "laptops",
        legacyCategories: [],
        brands: ["Dell"],
        priceRange: [20_000_000, 60_000_000],
        sortBy: "relevance",
        technical: {
            ram_gb: { kind: "number", min: 16, max: 64 },
            display_type: { kind: "text", values: ["OLED", "IPS"] },
        },
    };

    const search = serializeShopFilters(filters).toString();
    expect(parseShopFilters(`?${search}`, [0, 100_000_000])).toEqual(filters);
});
```

And category switching:

```ts
it("drops technical filters when canonical category changes", () => {
    expect(withCategory(filters, "monitors").technical).toEqual({});
});
```

Run:

```bash
pnpm --dir client test -- --run src/features/products/catalogFilters.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement deterministic URL encoding**

Use:

```text
category=laptops
ram_gb=16:64
display_type=OLED,IPS
```

Rules:
- sort text values before serialization for stable URLs;
- URL-encode values through `URLSearchParams`;
- reject non-finite numeric values;
- ignore unknown query keys unless the server-provided facet list later recognizes them.

- [ ] **Step 4: Implement backend filter translation**

Return the current API shape:

```ts
[
    { key: "ram_gb", min: 16, max: 64 },
    { key: "display_type", textValues: ["OLED", "IPS"] },
]
```

Only translate keys that exist in the current `attributeFacets` metadata.

- [ ] **Step 5: Preserve existing price parser behavior**

Move or delegate the current `parseShopPriceRange` behavior so `ShopsPage.filters.test.ts` remains green. Do not break old URLs that still carry `categories=...`.

- The provider owns the persisted selection state and synchronizes its own
  updates in the same tab plus storage events from other tabs. URL hydration
  validates two to four positive IDs and turns invalid or missing selections
  into an empty, readable state instead of throwing during app boot.

- [ ] **Step 6: Run tests**

```bash
pnpm --dir client test -- --run src/features/products/catalogFilters.test.ts src/pages/__tests__/ShopsPage.filters.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/features/products/catalogFilters.ts \
        client/src/features/products/catalogFilters.test.ts \
        client/src/pages/__tests__/ShopsPage.filters.test.ts
git commit -m "feat: add catalog filter url state"
```

---

### Task 7: Render server-driven technical facets on the storefront

**Files:**
- Create: `client/src/features/products/components/TechnicalFacetGroup.tsx`
- Create: `client/src/features/products/components/TechnicalFacetGroup.test.tsx`
- Modify: `client/src/features/products/api.ts`
- Modify: `client/src/features/products/api.test.ts`
- Modify: `client/src/components/common/AsideShops.tsx`
- Modify: `client/src/pages/ShopsPage.tsx`
- Modify: `client/src/styles/pages/_shops.scss`

**Interfaces:**
- `fetchProductFacets(category?: string): Promise<ProductFacets>`.
- `TechnicalFacetGroup` consumes one server facet and current value.
- `ShopsPage` sends JSON `attributeFilters` only after translating known metadata.

- [ ] **Step 1: Add client facet response types**

```ts
export type TextAttributeFacet = {
    key: string;
    label: string;
    type: "text";
    unit: string | null;
    values: Array<{ value: string; count: number }>;
    order: number;
};

export type NumberAttributeFacet = {
    key: string;
    label: string;
    type: "number";
    unit: string | null;
    min: number;
    max: number;
    order: number;
};

export type ProductFacets = {
    categories: string[];
    categoryOptions: CatalogCategory[];
    brands: string[];
    minPrice: number;
    maxPrice: number;
    totalProducts: number;
    category: CatalogCategory | null;
    attributeFacets: Array<TextAttributeFacet | NumberAttributeFacet>;
};
```

- [ ] **Step 2: Write failing accessible facet component tests**

Text facet:

```tsx
render(
    <TechnicalFacetGroup
        facet={{
            key: "display_type",
            label: "Display type",
            type: "text",
            unit: null,
            order: 10,
            values: [{ value: "OLED", count: 4 }],
        }}
        value={{ kind: "text", values: [] }}
        onChange={onChange}
    />,
);

await user.click(screen.getByRole("checkbox", { name: /oled/i }));
expect(onChange).toHaveBeenCalledWith({ kind: "text", values: ["OLED"] });
```

Numeric facet must expose labelled minimum/maximum controls and include the unit in accessible text.

Run:

```bash
pnpm --dir client test -- --run src/features/products/components/TechnicalFacetGroup.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `fetchProductFacets`**

```ts
export async function fetchProductFacets(category?: string): Promise<ProductFacets> {
    const response = await axios.get("/api/products/facets", {
        params: category ? { category } : undefined,
    });
    return normalizeProductFacets(response.data?.facets);
}
```

Normalization must default `attributeFacets` and `categoryOptions` to empty arrays and `category` to `null`.

- [ ] **Step 4: Implement `TechnicalFacetGroup`**

Text facets render checkboxes with counts.

Numeric facets use two labelled number inputs for Sprint 1; do not add another slider dependency. Clamp values to server min/max when serializing/applying.

Use `<fieldset>` and `<legend>`.

- [ ] **Step 5: Refactor `AsideShops` props**

Add:

```ts
attributeFacets: ProductFacets["attributeFacets"];
technicalFilters: ShopFilters["technical"];
onTechnicalFilterChange: (key: string, value: TechnicalFilterValue | null) => void;
```

Render technical groups after brand and before price only when `attributeFacets.length > 0`.

- [ ] **Step 6: Refactor `ShopsPage` to use extracted URL state**

Required flow:

```text
location.search
  -> parseShopFilters
  -> selected canonical category
  -> fetchProductFacets(category)
  -> recognize/restore technical query keys
  -> toAttributeFilters
  -> GET /api/products?...&attributeFilters=<JSON>
```

When selected category changes:
- clear `technical`;
- reset page to `1`;
- fetch new facet metadata;
- update URL.

Use the same canonical category value for the products request and the facet
request. Guard the two asynchronous responses with AbortController or a
request-generation check so a slower previous-category response cannot replace
newer facet metadata or product results. Reset technical state before starting
the new request.

When zero or legacy multiple categories are active:
- request global facets;
- render no technical groups.

- [ ] **Step 7: Preserve graceful facet failure**

If category-specific facet request fails:
- retain current products;
- retain category/brand/price controls from last known/global data if available;
- hide technical groups;
- show `Unable to load technical filters.` with a retry action or existing toast pattern;
- do not render an empty product result solely because facets failed.

- [ ] **Step 8: Run focused UI tests and build**

```bash
pnpm --dir client test -- --run src/features/products/components/TechnicalFacetGroup.test.tsx \
    src/features/products/catalogFilters.test.ts \
    src/pages/__tests__/ShopsPage.filters.test.ts
pnpm --dir client exec tsc -p tsconfig.json --noEmit
pnpm --dir client build
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add client/src/features/products/components/TechnicalFacetGroup.tsx \
        client/src/features/products/components/TechnicalFacetGroup.test.tsx \
        client/src/features/products/api.ts \
        client/src/features/products/api.test.ts \
        client/src/components/common/AsideShops.tsx \
        client/src/pages/ShopsPage.tsx \
        client/src/styles/pages/_shops.scss
git commit -m "feat: add category technical facets"
```

---

### Task 8: Add Sprint 1 MySQL and performance regression coverage

**Files:**
- Create: `server/src/products/__tests__/catalog.integration.test.ts`
- Modify: `server/test/k6-catalog-test.js`

**Interfaces:**
- Verifies real MySQL taxonomy, aliases, facet aggregation, and existing attribute filtering.
- Adds read-only k6 requests only.

- The integration suite must create an isolated catalog fixture explicitly:
  canonical category metadata, any legacy alias rows, category definitions,
  same-category products, manufacturer part numbers, and typed attributes.
  Clean up by fixture IDs in afterEach/afterAll. Do not assume demo:reset,
  demo-seed ordering, or production/Aiven data.
- If route-level assertions are required, create a real Nest test application
  or an explicit HTTP harness in this test file. Do not call an undefined
  requestCatalog helper copied from a pseudocode example.

- [ ] **Step 1: Add an integration case for canonical facet metadata**

Use the existing integration-test database bootstrapping pattern in the repository. Assert:

```ts
it("integration returns monitor technical facets from seeded MySQL metadata", async () => {
    const response = await catalogTestHarness.get("/api/products/facets?category=monitors");

    expect(response.status).toBe(200);
    expect(response.body.facets.category.slug).toBe("monitors");
    expect(response.body.facets.attributeFacets).toEqual(
        expect.arrayContaining([
            expect.objectContaining({ key: "refresh_rate_hz", type: "number" }),
        ]),
    );
});
```

- [ ] **Step 2: Add alias resolution integration case**

Request category identifier `phone` and assert the returned canonical category is `smartphones`.

- [ ] **Step 3: Add real attribute-filter query case**

Use the existing JSON query contract:

```ts
const filters = encodeURIComponent(JSON.stringify([
    { key: "refresh_rate_hz", min: 120 },
]));

const response = await catalogTestHarness.get(`/api/products?categories=Monitor&attributeFilters=${filters}`);
expect(response.status).toBe(200);
expect(response.body.products.every((product: any) => Number(product.attributes.refresh_rate_hz?.value) >= 120)).toBe(true);
```

- [ ] **Step 4: Extend k6 catalog read path**

Add a trend/check for:

```js
const technicalFacets = http.get(`${BASE_URL}/api/products/facets?category=monitors`);
check(technicalFacets, {
  "technical facets status is 200": (r) => r.status === 200,
});
```

And one filtered product GET with URL-encoded `attributeFilters`.

Keep all k6 operations read-only.

For any future comparison read in this k6 scenario, obtain candidate IDs from
one same-category catalog response and use at most four. If the response has
fewer than two products, skip the comparison check rather than hard-coding
database IDs. Keep the scenario read-only.

- [ ] **Step 5: Run integration and local k6**

```bash
pnpm --dir server test:integration
pnpm --dir server perf:catalog
```

Expected: integration PASS; k6 thresholds remain within the existing configured limits.

- [ ] **Step 6: Commit**

```bash
git add server/src/products/__tests__/catalog.integration.test.ts \
        server/test/k6-catalog-test.js
git commit -m "test: cover dynamic catalog facets"
```

---

# Sprint 2 — Search v2 + Product Comparison

### Task 9: Extend MySQL search relevance to SKU, MPN, and technical attributes

**Files:**
- Modify: `server/src/products/products.repository.ts`
- Modify: `server/src/products/products.controller.ts`
- Modify: `server/src/products/products.validator.ts`
- Create: `server/src/products/__tests__/product-search-v2.test.ts`
- Extend: `server/src/products/__tests__/catalog.integration.test.ts`

**Interfaces:**
- Keeps `GET /api/products/search?q=<term>&limit=<n>`.
- Enhances `GET /api/products` term ranking through the same repository path.
- Exact SKU/MPN outrank other signals.
- Typed attributes participate without changing the response shape.

- Introduce shared helpers for tokenization and numeric search normalization.
  Tokenization is trim, case-fold, punctuation-aware, and conjunctive: every
  meaningful token must match at least one searchable field or typed attribute.
  Numeric normalization must make 240, 240Hz, and 240 Hz equivalent without
  losing the attribute unit boundary. Reuse the same WHERE-builder helpers for
  the search endpoint and filtered product-list path.

- [ ] **Step 1: Write failing ranking unit tests around a pure order-builder helper**

Extract/introduce a testable internal helper:

```ts
export const buildProductSearchOrder = (normalizedTerm: string) => ({
    sql: "...",
    params: [],
});
```

Test priority by inspecting the deterministic CASE order, not by snapshotting the entire repository file:

```ts
it("weights exact SKU and MPN ahead of name and attribute matches", () => {
    const order = buildProductSearchOrder("demo-0004");
    expect(order.sql.indexOf("products.sku")).toBeLessThan(order.sql.indexOf("products.name"));
    expect(order.sql.indexOf("manufacturer_part_number")).toBeLessThan(order.sql.indexOf("product_attributes"));
});
```

Also test parameter list contains the normalized term variants in the same order as placeholders.

- [ ] **Step 2: Expand the search WHERE clause**

Add SKU/MPN and attribute existence:

```sql
OR LOWER(COALESCE(products.sku, '')) = ?
OR LOWER(COALESCE(products.manufacturer_part_number, '')) = ?
OR EXISTS (
    SELECT 1
    FROM product_attributes search_pa
    WHERE search_pa.product_id = products.id
      AND (
          LOWER(COALESCE(search_pa.text_value, '')) LIKE ?
          OR LOWER(CONCAT(COALESCE(search_pa.number_value, ''), COALESCE(search_pa.unit, ''))) LIKE ?
      )
)
```

Use bound values only.

For numeric+unit matching, normalize the query by removing spaces for an additional bound variant so `240 Hz` and `240Hz` can match the stored `240` + `Hz`.

- [ ] **Step 3: Update relevance scoring**

Use this relative order:

```text
exact SKU                 220
exact MPN                 210
exact name                180
name prefix               120
name contains              90
brand exact                55
category exact             50
attribute exact/contains   40
description contains       15
rating/review tie-breaker   small
sale status                 <= 2
```

Keep numeric weights as internal constants so tests can document intent.

- [ ] **Step 4: Preserve sort overrides**

`price-asc`, `price-desc`, and `rating-desc` still override search relevance exactly as before. Search relevance applies only to `relevance`.

- [ ] **Step 5: Handle exact SKU/MPN lookup before generic minimum-length rejection**

Controller behavior:

```ts
const term = typeof q === "string" ? q.trim() : "";
if (!term) return { products: [], msg: "Search term too short" };

const results = await this.productsRepository.searchProducts(term, safeLimit);
```

Let the repository decide whether a short term is an exact SKU/MPN. If the term is shorter than the generic threshold and no identity match exists, return `[]`.

Implement a repository helper `hasExactProductIdentity(term)` with a parameterized query, or fold identity lookup into a bounded first search query.

- [ ] **Step 6: Add MySQL integration assertions**

Use the isolated catalog fixture from Task 8 rather than assuming the demo seed,
then assert:
- exact demo SKU returns that product first;
- exact MPN returns that product first when MPN is present in the fixture;
- `240Hz` finds the 240Hz monitor;
- `OLED 16GB` returns products containing those searchable signals;
- existing `Dell`/`Monitor`/product-name searches still return results.

- [ ] **Step 7: Run focused and integration tests**

```bash
pnpm --dir server test -- --run src/products/__tests__/product-search-v2.test.ts
pnpm --dir server test:integration
pnpm --dir server typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/src/products/products.repository.ts \
        server/src/products/products.controller.ts \
        server/src/products/products.validator.ts \
        server/src/products/__tests__/product-search-v2.test.ts \
        server/src/products/__tests__/catalog.integration.test.ts
git commit -m "feat: improve technical product search"
```

---

### Task 10: Add bounded same-category comparison API

**Files:**
- Modify: `server/src/products/catalog-taxonomy.repository.ts`
- Modify: `server/src/products/catalog-taxonomy.service.ts`
- Modify: `server/src/products/products.repository.ts`
- Modify: `server/src/products/products.controller.ts`
- Modify: `server/src/products/products.types.ts`
- Create: `server/src/products/__tests__/product-comparison.test.ts`
- Extend: `server/src/products/__tests__/catalog.integration.test.ts`

**Interfaces:**
- Adds `GET /api/products/compare?ids=12,19,24`.
- Requires 2–4 unique positive integer IDs.
- Requires one canonical category.
- Returns fixed commercial rows plus ordered comparable technical rows.

- Add a standalone product-attribute batch read method such as
  listForProducts(productIds). The current transaction-context-only read is not
  sufficient for a bounded comparison request. Query at most four product IDs
  and merge values by product ID in service code.
- The product batch query must return category_id and all required commercial
  fields. Resolve the canonical category scope before building rows, reject
  missing IDs deterministically, and reject products whose canonical category
  differs even when their legacy category names are aliases.
- Integration coverage uses the explicit isolated fixture from Task 8, not
  seeded production or demo IDs.

- [ ] **Step 1: Write failing ID parser/validation tests**

Add a pure helper in controller/validator scope:

```ts
export const parseComparisonIds = (value: string): number[] => {
    const ids = value.split(",").map((part) => Number(part.trim()));
    if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
        throw new HttpException({ msg: "Comparison product ids must be positive integers" }, 400);
    }
    const unique = [...new Set(ids)];
    if (unique.length < 2 || unique.length > 4) {
        throw new HttpException({ msg: "Compare between 2 and 4 unique products" }, 400);
    }
    return unique;
};
```

Tests cover duplicates, one ID, five IDs, zero/negative/non-number.

- [ ] **Step 2: Add one bounded batch product query**

Repository method:

```ts
getProductsByIds(ids: number[]): Promise<ProductEditorRow[]>
```

SQL uses `IN (?, ?, ...)` with placeholders produced from trusted array length and values passed separately. Preserve caller order in service code rather than interpolating an `ORDER BY FIELD` string containing raw IDs.

- [ ] **Step 3: Add comparable-definition read**

Reuse Task 4 definition logic with `mode: "compare"`.

- [ ] **Step 4: Write failing same-category service tests**

```ts
it("rejects products from different canonical categories", async () => {
    productsRepository.getProductsByIds.mockResolvedValue([
        { id: 1, category: "Laptop" },
        { id: 2, category: "Monitor" },
    ] as any);

    await expect(service.compareProducts([1, 2]))
        .rejects.toMatchObject({ statusCode: 400, message: "Products must share one category" });
});
```

Also test missing IDs and stable row order.

- [ ] **Step 5: Implement comparison response shape**

Return:

```ts
type ProductComparisonResponse = {
    category: CatalogCategory;
    products: ProductEditorRow[];
    rows: Array<{
        key: string;
        label: string;
        type: "text" | "number" | "commercial";
        unit: string | null;
        values: Record<string, string | number | null>;
    }>;
};
```

Commercial rows use keys:

```text
brand
price
sale_status
rating
reviews
available_stock
warranty_months
sku
manufacturer_part_number
```

Technical rows use `category_attribute_definitions` where `comparable=1`, ordered by `comparison_order`.

Represent missing values as `null`; the client renders `—`.

- [ ] **Step 6: Add controller route before `@Get(":id")`**

```ts
@Get("compare")
async compareProducts(@Query("ids") ids: string) {
    const productIds = parseComparisonIds(ids);
    return {
        ...(await this.productsService.compareProducts(productIds)),
        msg: "Compare products successfully",
    };
}
```

Place the static route above `@Get(":id")` to avoid route capture.

- [ ] **Step 7: Add MySQL integration test**

Call compare with two seeded monitors and assert:
- status `200`;
- category `monitors`;
- both products present;
- `refresh_rate_hz` row appears in configured order.

Call one monitor + one smartphone and assert `400`.

- [ ] **Step 8: Run focused/integration tests**

```bash
pnpm --dir server test -- --run src/products/__tests__/product-comparison.test.ts
pnpm --dir server test:integration
pnpm --dir server typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add server/src/products/catalog-taxonomy.repository.ts \
        server/src/products/catalog-taxonomy.service.ts \
        server/src/products/products.repository.ts \
        server/src/products/products.controller.ts \
        server/src/products/products.types.ts \
        server/src/products/__tests__/product-comparison.test.ts \
        server/src/products/__tests__/catalog.integration.test.ts
git commit -m "feat: add product comparison api"
```

---

### Task 11: Add client comparison state and API contracts

**Files:**
- Create: `client/src/features/products/compare.ts`
- Create: `client/src/features/products/compare.test.ts`
- Create: `client/src/features/products/hooks/useProductComparison.ts`
- Modify: `client/src/features/products/api.ts`
- Modify: `client/src/features/products/api.test.ts`

**Interfaces:**
- Produces `ComparisonSelection`.
- Produces `addComparisonProduct`, `removeComparisonProduct`, `parseComparisonIdsFromSearch`, `differenceRows`.
- Produces `fetchProductComparison(ids)`.
- Hook persists only lightweight `{id, category}` selection metadata; server response remains authoritative.

- Add client/src/features/products/context/ProductComparisonContext.tsx and
  mount its provider once from client/src/app/providers.tsx above the route tree.
- Wire PaginatedItems, ShopsPage, HomePage, and ProductPage to the same context;
  no page or card may keep an independent comparison selection.

- [ ] **Step 1: Define pure selection type and errors**

```ts
export type ComparisonSelectionItem = {
    id: number;
    category: string;
    name: string;
};

export type ComparisonAddResult =
    | { ok: true; items: ComparisonSelectionItem[] }
    | { ok: false; reason: "different-category" | "limit-reached" | "duplicate" };
```

- [ ] **Step 2: Write failing pure tests**

Required cases:

```ts
it("allows up to four products from the same category", () => { /* exact ids 1..4 */ });
it("rejects a fifth product", () => { /* reason limit-reached */ });
it("rejects a different category", () => { /* reason different-category */ });
it("does not add a duplicate", () => { /* reason duplicate */ });
it("hydrates 2-4 valid ids from ?products=1,2,3", () => { /* [1,2,3] */ });
```

Difference helper:

```ts
expect(
    differenceRows([
        { key: "resolution", values: { "1": "QHD", "2": "QHD" } },
        { key: "refresh", values: { "1": 165, "2": 240 } },
    ] as any, ["1", "2"]),
).toEqual([expect.objectContaining({ key: "refresh" })]);
```

Run:

```bash
pnpm --dir client test -- --run src/features/products/compare.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement pure helpers**

Normalize category comparison with exact canonical category name/slug carried from normalized product data; do not guess from product names.

`differenceRows` treats `null`, `undefined`, and empty string as the same missing value and compares number/string display values deterministically.

- [ ] **Step 4: Implement `fetchProductComparison`**

Types:

```ts
export type ProductComparisonRow = {
    key: string;
    label: string;
    type: "text" | "number" | "commercial";
    unit: string | null;
    values: Record<string, string | number | null>;
};

export type ProductComparison = {
    category: CatalogCategory;
    products: Product[];
    rows: ProductComparisonRow[];
};
```

Fetcher:

```ts
export async function fetchProductComparison(ids: number[]): Promise<ProductComparison> {
    const response = await axios.get("/api/products/compare", {
        params: { ids: ids.join(",") },
    });
    return normalizeProductComparison(response.data);
}
```

- [ ] **Step 5: Implement the hook**

Persistence key:

```ts
const STORAGE_KEY = "digital-e:product-comparison:v1";
```

The hook exposes:

```ts
{
    items,
    add,
    remove,
    clear,
    has,
}
```

Storage corruption must fall back to `[]`, not throw during app boot.

- [ ] **Step 6: Run tests**

```bash
pnpm --dir client test -- --run src/features/products/compare.test.ts src/features/products/api.test.ts
pnpm --dir client exec tsc -p tsconfig.json --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/features/products/compare.ts \
        client/src/features/products/compare.test.ts \
        client/src/features/products/hooks/useProductComparison.ts \
        client/src/features/products/api.ts \
        client/src/features/products/api.test.ts \
        client/src/features/products/context/ProductComparisonContext.tsx \
        client/src/app/providers.tsx
git commit -m "feat: add product comparison state"
```

---

### Task 12: Add compare entry points and the dedicated comparison page

**Files:**
- Create: `client/src/features/products/pages/ComparePage.tsx`
- Create: `client/src/features/products/pages/ComparePage.test.tsx`
- Create: `client/src/styles/pages/_compare.scss`
- Modify: `client/src/components/common/ProductCard.tsx`
- Modify: `client/src/components/common/ProductItem.tsx`
- Modify: `client/src/components/common/ShopsItem.tsx`
- Modify: `client/src/components/common/__tests__/ProductCard.test.tsx`
- Modify: `client/src/features/products/pages/ProductPage.tsx`
- Modify: `client/src/routes/router.tsx`
- Modify: stylesheet aggregator
- Modify: `client/src/i18n/en.ts`
- Modify: `client/src/i18n/vi.ts`

**Interfaces:**
- New route `/compare?products=<2-4 ids>`.
- Product cards/detail expose explicit compare actions.
- Comparison page fetches one batch response and owns no stock truth.

- The entry-point wiring includes ProductCard, ProductItem, ShopsItem,
  PaginatedItems, ShopsPage, HomePage, and ProductPage. The shared provider
  supplies add/remove/has actions to all of them; do not create per-page
  comparison state.
- The compare route must treat missing, malformed, or fewer-than-two products
  query IDs as an empty guidance state or a deterministic client error, never as
  an unbounded API request.

- [ ] **Step 1: Write failing ProductCard compare-action test**

Extend `ProductCardProps`:

```ts
isCompared?: boolean;
onToggleCompare?: (product: Product) => void;
```

Test:

```tsx
render(
    <ProductCard
        product={product}
        uid=""
        isWishlist={false}
        onToggleWishlist={vi.fn()}
        onAddingCart={vi.fn()}
        isCompared={false}
        onToggleCompare={onToggleCompare}
    />,
);

await user.click(screen.getByRole("button", { name: `Compare ${product.name}` }));
expect(onToggleCompare).toHaveBeenCalledWith(product);
```

- [ ] **Step 2: Add a restrained compare action to cards**

Use a secondary/outline button or compact checkbox-style control below the commercial metadata and above Add to cart. Accessible names must include product name:

```tsx
aria-label={isCompared ? `Remove ${name} from comparison` : `Compare ${name}`}
aria-pressed={isCompared}
```

Do not place another icon-only control over the image.

- [ ] **Step 3: Add ProductPage compare action**

Reuse the same comparison hook/action. If adding the product violates category/limit rules, show an existing toast with exact messages:

```text
Compare products from the same category.
You can compare up to 4 products.
This product is already in your comparison.
```

- [ ] **Step 4: Write failing ComparePage route tests**

Cover:
- fewer than 2 IDs -> empty guidance;
- 2 valid IDs -> one batch API call;
- difference-only toggle;
- remove product updates URL;
- mixed/missing server error -> readable inline error;
- missing value renders `—`.

Example:

```tsx
expect(screen.getByRole("region", { name: /product comparison/i })).toBeInTheDocument();
await user.click(screen.getByRole("checkbox", { name: /show differences only/i }));
expect(screen.queryByText("Brand")).not.toBeInTheDocument(); // when identical in fixture
```

- [ ] **Step 5: Implement `ComparePage`**

Flow:

```text
location.search
  -> parseComparisonIdsFromSearch
  -> 2..4 ids?
  -> fetchProductComparison(ids)
  -> render commercial + technical rows
```

Use:
- `Helmet` title/description;
- existing `Layout`;
- current currency helper;
- existing cart context/API path for Add to cart;
- existing wishlist behavior when authenticated.

No duplicated price/stock computation.

- [ ] **Step 6: Implement responsive comparison table**

Markup:

```tsx
<section aria-label={t("compare.regionLabel")} className="compare__scroll-region">
    <table className="compare__table">...</table>
</section>
```

CSS requirements:
- horizontal overflow belongs to `.compare__scroll-region`, not `body`;
- first attribute column remains readable/sticky where browser support allows;
- product columns have a minimum readable width;
- focus outlines remain visible;
- no hover-only values.

- [ ] **Step 7: Add lazy route**

In router:

```ts
const ComparePage = lazy(() => import("../features/products/pages/ComparePage"));
```

Add the public route beside other storefront routes:

```tsx
<Route path="/compare" element={<ComparePage />} />
```

Use the repository's actual router object/element syntax.

- [ ] **Step 8: Add EN/VI copy**

Keys must include:
- comparison title/subtitle;
- add/remove/clear;
- show differences only;
- same-category error;
- max-four error;
- empty state;
- missing value;
- back to shop;
- region/table labels.

- [ ] **Step 9: Run focused client tests**

```bash
pnpm --dir client test -- --run src/components/common/__tests__/ProductCard.test.tsx \
    src/features/products/compare.test.ts \
    src/features/products/pages/ComparePage.test.tsx
pnpm --dir client exec tsc -p tsconfig.json --noEmit
pnpm --dir client build
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add client/src/features/products/pages/ComparePage.tsx \
        client/src/features/products/pages/ComparePage.test.tsx \
        client/src/styles/pages/_compare.scss \
        client/src/components/common/PaginatedItems.tsx \
        client/src/pages/HomePage.tsx \
        client/src/pages/ShopsPage.tsx \
        client/src/components/common/ProductCard.tsx \
        client/src/components/common/ProductItem.tsx \
        client/src/components/common/ShopsItem.tsx \
        client/src/components/common/__tests__/ProductCard.test.tsx \
        client/src/features/products/pages/ProductPage.tsx \
        client/src/routes/router.tsx \
        client/src/i18n/en.ts \
        client/src/i18n/vi.ts
git commit -m "feat: add product comparison experience"
```

---

### Task 13: Finalize API docs, Wiki, k6 coverage, and full verification

**Files:**
- Modify: `server/src/docs/openapi.json`
- Modify: `server/test/k6-catalog-test.js`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/API.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `Wiki/index.md`
- Modify: `Wiki/architecture.md`
- Create: Wiki/concepts/catalog-discovery-and-comparison.md
- Modify: `Wiki/concepts/order-lifecycle-and-support.md`

**Interfaces:**
- Documents all additive contracts shipped by Tasks 1–12.
- Removes the Wiki statement that product comparison is deferred and replaces it with current-state behavior.
- Adds comparison/search requests to read-only performance coverage.

- [ ] **Step 1: Update OpenAPI paths and schemas**

Document:

```text
GET /api/products/categories
GET /api/products/facets?category=<identifier>
GET /api/products/compare?ids=<id,id>
GET /api/products/search?q=<term>&limit=<n>
```

Add schemas:
- `CatalogCategory`
- `CatalogAttributeFacet`
- `ProductComparison`
- `ProductComparisonRow`

Keep old product/facet fields documented.

- [ ] **Step 2: Update API guide**

Explain exact URL/query examples:

```text
/shops?category=monitors&refresh_rate_hz=120:360
GET /api/products/facets?category=monitors
GET /api/products?categories=Monitor&attributeFilters=[...]
GET /api/products/compare?ids=12,19
GET /api/products/search?q=240Hz
```

State that `attributeFilters` remains JSON encoded on the API even though storefront URLs are human-readable.

- [ ] **Step 3: Update architecture/Wiki**

Record:
- legacy category IDs remain durable;
- canonical metadata and aliases are additive;
- per-product technical values remain in `product_attributes`;
- category attribute definitions drive filter/comparison presentation;
- comparison is now implemented and same-category only;
- Search v2 remains MySQL-based.

In `Wiki/concepts/order-lifecycle-and-support.md`, replace the deferred-comparison sentence with a concise link/current-state note rather than leaving contradictory documentation.

Create the catalog-discovery-and-comparison Wiki concept as the primary
long-term owner of taxonomy, category scope, facets, Search v2, comparison,
seed invariants, and rollout constraints. Update Wiki/index.md backlinks and
append the required Wiki maintenance log entry. The order-lifecycle page only
receives a compatibility link replacing its obsolete deferred-comparison note.

- [ ] **Step 4: Extend k6 with search and compare reads**

The compare scenario must first request a same-category catalog page, extract
two to four product IDs from that response, and only then call compare. Prefer
an environment override for the category slug. If fewer than two IDs are
available, mark the comparison check as skipped rather than failing because
the load-test fixture is too small. Never hard-code production IDs.

Add checks:

```js
const technicalSearch = http.get(`${BASE_URL}/api/products/search?q=240Hz&limit=6`);
check(technicalSearch, {
  "technical search status is 200": (r) => r.status === 200,
});

const comparison = http.get(`${BASE_URL}/api/products/compare?ids=${COMPARE_IDS}`);
check(comparison, {
  "comparison status is 200": (r) => r.status === 200,
});
```

COMPARE_IDS must be generated from the same-category catalog response at
runtime or supplied by an isolated test-fixture environment; never hard-code
production IDs in the load test.

- [ ] **Step 5: Run complete server verification**

```bash
pnpm --dir server prisma:format
pnpm --dir server prisma:validate
pnpm --dir server prisma:migrate:status
pnpm --dir server demo:verify
pnpm --dir server typecheck
pnpm --dir server lint
pnpm --dir server test -- --run
pnpm --dir server test:integration
pnpm --dir server build
pnpm --dir server perf:catalog
```

Expected: every command succeeds. If k6 is not installed in the execution environment, record only that tooling prerequisite as the reason the performance command could not run; do not claim it passed.

- [ ] **Step 6: Run complete client verification**

```bash
pnpm --dir client exec tsc -p tsconfig.json --noEmit
pnpm --dir client lint
pnpm --dir client test -- --run
pnpm --dir client build
```

Expected: every command succeeds.

- [ ] **Step 7: Manually verify key storefront flows against the isolated/local or preview environment**

Verify exactly:
1. `/shops` loads with global filters.
2. Selecting one category exposes only its technical facets.
3. Reload/back/forward preserves human-readable filter URL state.
4. Technical filtering changes the product results.
5. Search for a real seeded SKU returns that product first.
6. Search for `240Hz`, `OLED`, or another seeded technical value returns relevant products.
7. Add two same-category products to comparison and open `/compare`.
8. `Show differences only` removes identical rows.
9. Mixed-category comparison is blocked.
10. Add-to-cart from comparison still uses current cart behavior.
11. Admin add/edit product only offers canonical active categories.

- [ ] **Step 8: Commit documentation/performance completion**

```bash
git add server/src/docs/openapi.json \
        server/test/k6-catalog-test.js \
        README.md \
        CHANGELOG.md \
        docs/API.md \
        docs/ARCHITECTURE.md \
        Wiki/index.md \
        Wiki/architecture.md \
        Wiki/concepts/catalog-discovery-and-comparison.md
        Wiki/concepts/order-lifecycle-and-support.md
git commit -m "docs: document catalog discovery and comparison"
```

- [ ] **Step 9: Inspect final diff for scope control**

Run:

```bash
git status --short
git diff --stat main...HEAD
git diff main...HEAD -- README.md CHANGELOG.md docs/API.md docs/ARCHITECTURE.md Wiki/
```

Confirm no unrelated RMA, shipment, price-watch, PC-builder, AI, payment, or order-state changes entered the branch.

---

# Release Sequence

Implement and review in this order:

```text
Task 1  schema
  ↓
Task 2  deterministic seed
  ↓
Task 3  taxonomy boundary
  ↓
Task 4  server dynamic facets
  ↓
Task 5  canonical admin writes
  ↓
Task 6  client URL state
  ↓
Task 7  storefront dynamic facets
  ↓
Task 8  Sprint 1 integration/perf gate
  ↓
Task 9  Search v2
  ↓
Task 10 comparison API
  ↓
Task 11 comparison state/API client
  ↓
Task 12 comparison UI
  ↓
Task 13 docs/full verification
```

Sprint 1 is independently releasable after Task 8.

Sprint 2 should start only after Task 8 is green so comparison/search build on stable canonical categories and attribute metadata.

# Acceptance Checklist

## Sprint 1

- [ ] Existing product IDs remain unchanged.
- [ ] Existing order snapshots remain unchanged.
- [ ] No products.category_id values are rewritten; aliases use an explicit
      category scope that includes compatible legacy IDs.
- [ ] Existing product list callers remain compatible.
- [ ] Active categories have stable canonical slugs/groups.
- [ ] Legacy aliases resolve to canonical categories.
- [ ] Demo definitions have matching typed product_attributes values and stable
      manufacturer part numbers; undeclared values do not create facets.
- [ ] Admin product writes cannot create arbitrary duplicate categories.
- [ ] One selected category exposes server-driven text/numeric technical facets.
- [ ] Scoped categories, brands, prices, and totals describe the same category
      product set as the technical facets.
- [ ] Zero/multiple categories do not expose incompatible technical facets.
- [ ] Technical filters are shareable/reload-safe through the storefront URL.
- [ ] Technical facet failure does not break the product list.
- [ ] MySQL integration and read-only catalog k6 cover the new read paths.

## Sprint 2

- [ ] Search exact SKU ranks first.
- [ ] Search exact MPN ranks first when populated.
- [ ] Multi-token search uses AND semantics and numeric terms normalize 240,
      240Hz, and 240 Hz consistently.
- [ ] Search technical values such as `240Hz`, `12GB`, `OLED`, and `AM5` when present in typed attributes.
- [ ] Existing name/brand/category search still works.
- [ ] Search combines with category/brand/price/attribute filtering.
- [ ] Compare accepts 2–4 unique same-category products only.
- [ ] Compare response is one bounded batch request.
- [ ] Comparison rows are server-ordered from category definitions.
- [ ] Missing values render as `—`.
- [ ] `Show differences only` behaves deterministically.
- [ ] Compare URL is shareable and reload-safe.
- [ ] Comparison horizontal overflow is contained and keyboard accessible.
- [ ] Existing add-to-cart and wishlist behavior is reused, not reimplemented.
- [ ] Comparison selection is owned by one provider shared by cards, home,
      shops, and product detail; storage/URL corruption is non-fatal.
- [ ] Integration tests do not require demo seed ordering or shared databases.

# Execution Notes

- Do not create a worktree for this repository unless the user explicitly asks
  for one; implementation should remain on the current approved branch.
- Prefer one task per review cycle and one commit per task as written above.
- Do not squash intermediate commits until final review; task boundaries make regression bisection and code review easier.
- If implementation reveals a required breaking API/schema change not described by the approved spec, stop execution and return to design review instead of silently expanding scope.
- This plan remains blocked from implementation until the user approves the
  revised design and plan. If any requirement is unclear during review, stop
  and ask rather than guessing.
