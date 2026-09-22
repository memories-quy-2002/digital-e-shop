# Product Comparison Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Build a guest-friendly Product Comparison vertical slice with a bounded public API, authoritative VND product data, local comparison state, responsive comparison UI, and complete EN/VI plus dark/light support.

**Architecture:** Add a read-only comparison capability inside the existing Products feature. The backend validates a maximum of four product IDs, performs one parameterized batch read, enforces the same-category rule, and returns current product data with structured attributes. The frontend stores only product IDs in a shared ComparisonContext, exposes actions from product cards and detail pages, and renders a shareable /compare matrix with a bottom tray.

**Tech Stack:** NestJS 11 + Express 5, MySQL repositories, React 19, React Router 7, TypeScript strict mode, Vitest + Testing Library, Tailwind/Radix UI primitives, SCSS BEM styles, existing http client, i18n dictionaries, existing CartContext, Playwright browser verification.

## Global Constraints

- Work directly on the current branch/worktree; do not create a worktree or branch for this feature.
- Keep client/ and server/ as independent pnpm packages; do not add a root workspace, root lockfile, or root E2E setup.
- Keep all displayed prices in VND; do not add Stripe, USD, or bank-transfer behavior.
- Do not add a database table, migration, dependency, account requirement, or persistent comparison record.
- Store only bounded product IDs under digital-e:comparison:v1; product details must be re-fetched from the server.
- Allow two to four distinct products only; enforce the maximum and same-category rule on the server.
- Keep products with zero available stock comparable; disable only the cart action and show the unavailable state.
- Preserve existing product, cart, auth, CSRF, response, route-alias, and theme behavior outside this feature.
- Add every new copy to both client/src/i18n/en.ts and client/src/i18n/vi.ts.
- Keep hover, pressed, disabled, focus-visible, loading, error, and out-of-stock states readable in dark/light themes.
- Run targeted tests after each task and report commands that cannot run.

---

## File map

### Backend

- Create server/src/products/products.compare.ts for pure ID parsing, error creation, attribute projection, and category policy.
- Modify server/src/products/products.types.ts for comparison row and response types.
- Modify server/src/products/products.repository.ts for one parameterized batch query.
- Modify server/src/products/products.service.ts for lookup, missing-product detection, category enforcement, order preservation, and projection.
- Modify server/src/products/products.controller.ts for GET /api/products/compare before GET /api/products/:id.
- Create server/src/products/__tests__/products.compare.test.ts.
- Create server/src/products/__tests__/products.compare.service.test.ts.
- Create server/src/products/__tests__/products.compare.controller.test.ts.

### Frontend

- Create client/src/features/products/compare/types.ts.
- Create client/src/features/products/compare/compareMatrix.ts and compareMatrix.test.ts.
- Modify client/src/features/products/api.ts and api.test.ts.
- Create client/src/context/ComparisonContext.tsx and its test.
- Modify client/src/app/providers.tsx and client/src/components/layout/Layout.tsx.
- Create ComparisonTray.tsx, ComparisonTable.tsx, ProductComparisonPage.tsx, and _comparison.scss.
- Modify ProductCard.tsx, ProductCard.test.tsx, ProductPage.tsx, router.tsx, en.ts, and vi.ts.
- Add ProductComparisonPage.test.tsx.

### Documentation

- Modify docs/API.md.
- Modify Wiki/concepts/order-lifecycle-and-support.md, Wiki/architecture.md, Wiki/index.md, and append Wiki/log.md.

---
## Task 1: Define backend comparison contracts and pure policies

**Files:**
- Create: server/src/products/products.compare.ts
- Modify: server/src/products/products.types.ts
- Test: server/src/products/__tests__/products.compare.test.ts

**Interfaces:**
- Consumes: existing ProductAttribute and ProductEditorRow shapes.
- Produces: parseComparisonIds, ComparisonValidationError, ProductComparisonRow, ProductComparisonItem, and ComparisonResponse.

- [ ] Step 1: Write failing parser and category-policy tests.

~~~typescript
import { describe, expect, it } from "vitest";
import { parseComparisonIds, assertComparisonCategory, ComparisonValidationError } from "../products.compare";

describe("product comparison policies", () => {
    it.each([
        ["", "COMPARE_INVALID_IDS"],
        ["12", "COMPARE_INVALID_IDS"],
        ["12,12", "COMPARE_INVALID_IDS"],
        ["12,18,24,30,42", "COMPARE_INVALID_IDS"],
        ["12,zero", "COMPARE_INVALID_IDS"],
        ["12,-4", "COMPARE_INVALID_IDS"],
    ])("rejects invalid ids %s", (value, code) => {
        expect(() => parseComparisonIds(value)).toThrowError(
            expect.objectContaining({ code }),
        );
    });

    it("preserves distinct positive ids in order", () => {
        expect(parseComparisonIds("24, 12, 18")).toEqual([24, 12, 18]);
    });

    it("rejects different categories and accepts one category", () => {
        expect(() => assertComparisonCategory([
            { id: 12, categoryId: 3, category: "Laptops" },
            { id: 18, categoryId: 4, category: "Phones" },
        ])).toThrowError(
            expect.objectContaining({ code: "COMPARE_CATEGORY_MISMATCH" }),
        );

        expect(() => assertComparisonCategory([
            { id: 12, categoryId: 3, category: "Laptops" },
            { id: 18, categoryId: 3, category: "Laptops" },
        ])).not.toThrow();
    });

    it("exposes the status and code on validation errors", () => {
        expect(new ComparisonValidationError(
            "COMPARE_INVALID_IDS",
            "Two to four valid products are required.",
            400,
        )).toMatchObject({ code: "COMPARE_INVALID_IDS", statusCode: 400 });
    });
});
~~~

- [ ] Step 2: Run the focused test and verify it fails.

~~~powershell
pnpm --dir server exec vitest run src/products/__tests__/products.compare.test.ts
~~~

Expected: FAIL because the comparison policy module does not exist.

- [ ] Step 3: Add the types and pure policy module.

Add to products.types.ts:

~~~typescript
export type ProductComparisonRow = ProductEditorRow & {
    categoryId: number;
    attributes?: ProductAttribute[] | Record<string, unknown> | string | null;
};

export type ProductComparisonItem = ProductEditorRow & {
    attributes: ProductAttribute[];
};

export type ComparisonResponse = {
    category: { name: string };
    products: ProductComparisonItem[];
};
~~~

Implement products.compare.ts without Nest or database dependencies. It must
export ComparisonValidationError, parseComparisonIds, assertComparisonCategory,
and normalizeComparisonAttributes. The parser accepts two to four distinct
positive integers; the category policy compares category IDs; the attribute
mapper returns only key, label, type, value, and unit with value as a string.

- [ ] Step 4: Run the same Vitest command. Expected: PASS.
- [ ] Step 5: Commit.

~~~powershell
git add server/src/products/products.compare.ts server/src/products/products.types.ts server/src/products/__tests__/products.compare.test.ts
git commit -m "test(products): define comparison policies"
~~~

## Task 2: Add the public batch comparison API

**Files:**
- Modify: server/src/products/products.repository.ts
- Modify: server/src/products/products.service.ts
- Modify: server/src/products/products.controller.ts
- Test: server/src/products/__tests__/products.compare.service.test.ts
- Test: server/src/products/__tests__/products.compare.controller.test.ts

**Interfaces:**
- Consumes: Task 1 policies and response types.
- Produces: NestProductsService.getProductsForComparison(ids: number[]) and GET /api/products/compare?ids=.

- [ ] Step 1: Write failing service and controller tests.

Use a fake repository and assert order, missing IDs, and category mismatch
without MySQL:

~~~typescript
const product = (overrides: Partial<ProductComparisonRow> = {}): ProductComparisonRow => ({
    id: 12,
    name: "Laptop A",
    category: "Laptops",
    categoryId: 3,
    brand: "Digital-E",
    sku: "LAPTOP-A",
    price: 20000000,
    stock: 4,
    attributes: {},
    ...overrides,
});

it("returns requested order and normalized category", async () => {
    const repository = {
        getProductsForComparison: vi.fn().mockResolvedValue([
            product({ id: 18, name: "Laptop B" }),
            product(),
        ]),
    };
    const service = createProductsServiceWithRepository(repository);

    await expect(service.getProductsForComparison([12, 18])).resolves.toMatchObject({
        category: { name: "Laptops" },
        products: [{ id: 12 }, { id: 18 }],
    });
});

it("rejects missing products with their ids", async () => {
    const repository = {
        getProductsForComparison: vi.fn().mockResolvedValue([product()]),
    };
    const service = createProductsServiceWithRepository(repository);

    await expect(service.getProductsForComparison([12, 18])).rejects.toMatchObject({
        code: "COMPARE_PRODUCTS_NOT_FOUND",
        statusCode: 404,
        details: { missingIds: [18] },
    });
});
~~~

The controller test verifies valid { comparison, msg } output and parser errors
become HttpException with { code, msg } and the expected status.

- [ ] Step 2: Run the tests and verify they fail.

~~~powershell
pnpm --dir server exec vitest run src/products/__tests__/products.compare.service.test.ts src/products/__tests__/products.compare.controller.test.ts
~~~

Expected: FAIL because the repository/service/controller methods are absent.

- [ ] Step 3: Add getProductsForComparison to the repository.

Use one parameterized query with existing availability, rating, review,
category, brand, and attribute selectors. Select category_id as categoryId,
filter products.stock >= 0, and use placeholders generated from the bounded ID
array. Never interpolate IDs into SQL. The result type is ProductComparisonRow[].

Preserve the existing query-fragment pattern:

~~~typescript
const placeholders = productIds.map(() => "?").join(", ");
const selectFragments = [
    "products.id",
    "products.name",
    "description",
    "products.category_id AS categoryId",
    "categories.name AS category",
    "brands.name AS brand",
    "products.sku",
    "products.manufacturer_part_number",
    "products.warranty_months",
    "price",
    "sale_price",
    "stock",
    "GREATEST(products.stock - COALESCE(active_reservations.reserved_quantity, 0), 0) AS available_stock",
    "main_image",
    "specifications",
    productAttributesSelect("products"),
    productRatingSelect,
].join(", ");

const sql = [
    "SELECT " + selectFragments,
    "FROM products",
    "JOIN categories ON categories.id = products.category_id",
    "JOIN brands ON brands.id = products.brand_id",
    productRatingJoin,
    productAvailabilityJoin,
    "WHERE products.id IN (" + placeholders + ") AND products.stock >= 0",
].join("\\n");
~~~

- [ ] Step 4: Add service orchestration.

The service calls the repository once, detects missing IDs, restores requested
order, enforces assertComparisonCategory, and returns normalized attributes:

~~~typescript
const rows = await this.productsRepository.getProductsForComparison(ids);
const foundIds = new Set(rows.map((row) => row.id));
const missingIds = ids.filter((id) => !foundIds.has(id));

if (missingIds.length > 0) {
    throw new ComparisonValidationError(
        "COMPARE_PRODUCTS_NOT_FOUND",
        "One or more products could not be found.",
        404,
        { missingIds },
    );
}

const ordered = ids.map((id) => rows.find((row) => row.id === id) as ProductComparisonRow);
assertComparisonCategory(ordered);

return {
    category: { name: ordered[0].category },
    products: ordered.map((row) => ({
        ...row,
        attributes: normalizeComparisonAttributes(row.attributes),
    })),
};
~~~

- [ ] Step 5: Add the route before GET :id.

~~~typescript
@Get("compare")
async compareProducts(@Query("ids") idsQuery: string) {
    try {
        const ids = parseComparisonIds(idsQuery);
        const comparison = await this.productsService.getProductsForComparison(ids);
        return { comparison, msg: "Products ready for comparison" };
    } catch (error) {
        if (error instanceof ComparisonValidationError) {
            throw new HttpException(
                { code: error.code, msg: error.message, ...error.details },
                error.statusCode,
            );
        }
        throw error;
    }
}
~~~

Keep GET /api/products/:id unchanged.

- [ ] Step 6: Run focused tests and commit.

~~~powershell
pnpm --dir server exec vitest run src/products/__tests__/products.compare.test.ts src/products/__tests__/products.compare.service.test.ts src/products/__tests__/products.compare.controller.test.ts
git add server/src/products/products.repository.ts server/src/products/products.service.ts server/src/products/products.controller.ts server/src/products/__tests__
git commit -m "feat(products): add batch comparison endpoint"
~~~

Expected: PASS.

## Task 3: Add frontend comparison API types and matrix normalization

**Files:**
- Create: client/src/features/products/compare/types.ts
- Create: client/src/features/products/compare/compareMatrix.ts
- Test: client/src/features/products/compare/compareMatrix.test.ts
- Modify: client/src/features/products/api.ts
- Test: client/src/features/products/api.test.ts

**Interfaces:**
- Consumes: Task 2 response, existing Product, ProductAttributeRow, normalizeProductWithAttributes, and parseProductDetails.
- Produces: ProductComparison, ComparisonMatrixRow, buildComparisonRows, and fetchProductComparison(ids).

- [ ] Step 1: Write failing matrix tests.

~~~typescript
it("keeps first-seen order and represents missing values as an em dash", () => {
    const result = buildComparisonRows([
        product(12, [
            { id: "a", key: "memory", label: "Memory", type: "text", value: "16 GB", unit: "", filterable: true },
            { id: "b", key: "storage", label: "Storage", type: "text", value: "1 TB", unit: "", filterable: true },
        ]),
        product(18, [
            { id: "c", key: "memory", label: "Memory", type: "text", value: "32 GB", unit: "", filterable: true },
        ]),
    ]);

    expect(result).toEqual([
        { key: "memory", label: "Memory", values: { "12": "16 GB", "18": "32 GB" }, isDifferent: true },
        { key: "storage", label: "Storage", values: { "12": "1 TB", "18": "—" }, isDifferent: true },
    ]);
});

it("uses legacy text specifications when structured attributes are absent", () => {
    expect(buildComparisonRows([
        product(30, [], "Display: 14 inch, Weight: 1.2 kg"),
        product(31, [], "Display: 16 inch"),
    ]).map((row) => row.key)).toEqual(["display", "weight"]);
});
~~~

- [ ] Step 2: Run and verify failure.

~~~powershell
pnpm --dir client exec vitest run src/features/products/compare/compareMatrix.test.ts
~~~

Expected: FAIL because the module does not exist.

- [ ] Step 3: Define types and build the pure matrix helper.

~~~typescript
export type ProductComparison = {
    category: { name: string };
    products: ProductWithAttributes[];
};

export type ComparisonMatrixRow = {
    key: string;
    label: string;
    unit?: string;
    values: Record<string, string>;
    isDifferent: boolean;
};
~~~

Implement buildComparisonRows by adding structured attributes in first-seen
order, falling back to parseProductDetails only when structured attributes are
empty, filling absent values with em dash, and comparing trimmed
case-insensitive values. Add a helper to filter rows by isDifferent. Do not
format currency or mutate products.

- [ ] Step 4: Add fetchProductComparison.

~~~typescript
export async function fetchProductComparison(ids: number[]): Promise<ProductComparison> {
    const response = await http.get("/api/products/compare", {
        params: { ids: ids.join(",") },
    });
    const comparison = response.data.comparison;

    return {
        category: { name: String(comparison?.category?.name ?? "") },
        products: Array.isArray(comparison?.products)
            ? comparison.products.map(normalizeProductWithAttributes)
            : [],
    };
}
~~~

Add a test for the exact ids query parameter and normalized attributes. Keep
existing product and wishlist API contracts unchanged.

- [ ] Step 5: Run tests and commit.

~~~powershell
pnpm --dir client exec vitest run src/features/products/compare/compareMatrix.test.ts src/features/products/api.test.ts
git add client/src/features/products/compare client/src/features/products/api.ts client/src/features/products/api.test.ts
git commit -m "feat(products): add comparison data contracts"
~~~

Expected: PASS.

## Task 4: Add shared selection state and comparison tray

**Files:**
- Create: client/src/context/ComparisonContext.tsx
- Test: client/src/context/__tests__/ComparisonContext.test.tsx
- Modify: client/src/app/providers.tsx
- Create: client/src/features/products/components/ComparisonTray.tsx
- Modify: client/src/components/layout/Layout.tsx

**Interfaces:**
- Consumes: useLocalStorage, useT, React Router Link, and Task 3 types.
- Produces: useComparison with selectedIds, isSelected, add, remove, toggle, clear, replace, and canCompare.

- [ ] Step 1: Write failing context tests.

Use a probe component that renders selected IDs and canCompare and exposes
buttons for add, remove, and clear. Assert that hydration keeps four distinct
positive IDs, one selected item is not ready, two are ready, a known different
category is rejected, remove updates localStorage, and clear empties selection.

~~~tsx
const Probe = () => {
    const comparison = useComparison();
    return (
        <>
            <span data-testid="ids">{comparison.selectedIds.join(",")}</span>
            <span data-testid="can-compare">{String(comparison.canCompare)}</span>
            <button onClick={() => comparison.add(12, "Laptops")}>add-12</button>
            <button onClick={() => comparison.add(18, "Laptops")}>add-18</button>
            <button onClick={() => comparison.add(24, "Phones")}>add-phone</button>
            <button onClick={() => comparison.remove(12)}>remove-12</button>
            <button onClick={comparison.clear}>clear</button>
        </>
    );
};
~~~

- [ ] Step 2: Run and verify failure.

~~~powershell
pnpm --dir client exec vitest run src/context/__tests__/ComparisonContext.test.tsx
~~~

Expected: FAIL because the provider and hook are absent.

- [ ] Step 3: Implement the context contract.

~~~typescript
export type ComparisonAddResult =
    | "added"
    | "already-selected"
    | "limit-reached"
    | "category-mismatch";

export type ComparisonContextValue = {
    selectedIds: number[];
    canCompare: boolean;
    isSelected: (productId: number) => boolean;
    add: (productId: number, category?: string) => ComparisonAddResult;
    remove: (productId: number) => void;
    toggle: (productId: number, category?: string) => ComparisonAddResult | "removed";
    clear: () => void;
    replace: (productIds: number[]) => void;
};
~~~

Use useLocalStorage with key digital-e:comparison:v1. Sanitize positive integer
IDs, deduplicate, and slice to four. Keep a runtime category map for early
same-category feedback, but never persist it. canCompare is
selectedIds.length >= 2. replace sanitizes URL IDs; the API remains
authoritative for catalog existence and category.

- [ ] Step 4: Wire provider, tray, and shell.

Add ComparisonProvider inside BrowserRouter in app/providers.tsx. Render
ComparisonTray between main content and Footer in Layout.tsx. The tray renders
nothing when empty, exposes localized remove/clear buttons, shows selected count,
links to /compare?ids=selectedIds.join(","), and disables navigation until two
items exist. It must not fetch product data solely to render. On mobile it
becomes a compact bottom sheet and must not cover page actions.

- [ ] Step 5: Run tests and commit.

~~~powershell
pnpm --dir client exec vitest run src/context/__tests__/ComparisonContext.test.tsx
git add client/src/context/ComparisonContext.tsx client/src/context/__tests__/ComparisonContext.test.tsx client/src/app/providers.tsx client/src/components/layout/Layout.tsx client/src/features/products/components/ComparisonTray.tsx
git commit -m "feat(products): add shared comparison selection"
~~~

Expected: PASS with existing cart/auth provider behavior unchanged.

## Task 5: Add product-card/detail entry points and routing

**Files:**
- Modify: client/src/components/common/ProductCard.tsx
- Modify: client/src/components/common/__tests__/ProductCard.test.tsx
- Modify: client/src/features/products/pages/ProductPage.tsx
- Modify: client/src/routes/router.tsx

**Interfaces:**
- Consumes: useComparison, useT, product IDs/categories, and Task 4 tray.
- Produces: accessible Compare controls and lazy /compare route for Task 6.

- [ ] Step 1: Add failing card assertions.

Render ProductCard under ComparisonProvider and assert:

~~~tsx
expect(screen.getByRole("button", { name: "Add to compare" }))
    .toHaveAttribute("aria-pressed", "false");

fireEvent.click(screen.getByRole("button", { name: "Add to compare" }));

expect(screen.getByRole("button", { name: "Remove from compare" }))
    .toHaveAttribute("aria-pressed", "true");
~~~

Also assert that the selected state has a visible selected class and readable
text. Add one test for category mismatch and one for the four-product limit.

- [ ] Step 2: Run and verify failure.

~~~powershell
pnpm --dir client exec vitest run src/components/common/__tests__/ProductCard.test.tsx
~~~

Expected: FAIL because ProductCard has no comparison control.

- [ ] Step 3: Implement ProductCard and ProductPage controls.

Use useComparison with normalized product ID/category. Call toggle, use
localized Add to compare/Remove from compare labels, set aria-pressed, and show
localized feedback for category-mismatch and limit-reached. Keep wishlist and
cart logic unchanged. Place controls before cart actions with minimum 44px
height and a single-line label. On ProductPage use the same toggle logic beside
the wishlist action.

- [ ] Step 4: Add the lazy route.

Add a lazy ProductComparisonPage import and register:

~~~tsx
<Route path="/compare" element={<ProductComparisonPage />} />
~~~

The page file is created in Task 6, so route compilation completes after Task 6.

- [ ] Step 5: Run focused test and commit.

~~~powershell
pnpm --dir client exec vitest run src/components/common/__tests__/ProductCard.test.tsx
git add client/src/components/common/ProductCard.tsx client/src/components/common/__tests__/ProductCard.test.tsx client/src/features/products/pages/ProductPage.tsx client/src/routes/router.tsx
git commit -m "feat(products): add comparison entry points"
~~~

## Task 6: Build responsive comparison page and localization

**Files:**
- Create: client/src/features/products/components/ComparisonTable.tsx
- Create: client/src/features/products/pages/ProductComparisonPage.tsx
- Create: client/src/styles/pages/_comparison.scss
- Modify: client/src/i18n/en.ts
- Modify: client/src/i18n/vi.ts
- Test: client/src/features/products/pages/__tests__/ProductComparisonPage.test.tsx

**Interfaces:**
- Consumes: fetchProductComparison, buildComparisonRows, useComparison, useCart, useT, and existing image/currency helpers.
- Produces: /compare with loading, success, empty, mismatch, not-found, retry, and cart-action states.

- [ ] Step 1: Add matching translation keys.

Add a comparison object to both dictionaries with keys for pageTitle,
pageDescription, selectedCount, addToCompare, removeFromCompare, compareNow,
clearAll, remove, showDifferencesOnly, specifications, warranty, inStock,
outOfStock, addToCart, loading, emptyTitle, emptyDescription, oneProductTitle,
categoryMismatch, invalidLink, notFound, loadError, retry, added, removed,
limitReached, and missingValue. Use natural Vietnamese translations in vi.ts,
not copied English strings.

- [ ] Step 2: Write failing page/table tests.

Mock fetchProductComparison and render through MemoryRouter, LocaleProvider,
ComparisonProvider, and a cart mock. Assert that success contains a Compare
products heading, VND prices, the Show differences only checkbox, a
specification row, and product remove actions. Add tests for category mismatch,
not-found/retry, and out-of-stock products with disabled Add to cart.

- [ ] Step 3: Run and verify failure.

~~~powershell
pnpm --dir client exec vitest run src/features/products/pages/__tests__/ProductComparisonPage.test.tsx
~~~

Expected: FAIL because page and table components do not exist.

- [ ] Step 4: Implement ComparisonTable with semantic markup.

Use a real table with caption, scope="col", scope="row", and a labelled scoped
scroll region:

~~~tsx
<div className="comparison-table__viewport" role="region" aria-labelledby="comparison-table-caption" tabIndex={0}>
    <table className="comparison-table">
        <caption id="comparison-table-caption">{t("comparison.specifications")}</caption>
        <thead>
            <tr>
                <th scope="col">{t("comparison.specifications")}</th>
                {products.map((product) => (
                    <th scope="col" key={product.id}>{product.name}</th>
                ))}
            </tr>
        </thead>
        <tbody>
            {rows.map((row) => (
                <tr key={row.key}>
                    <th scope="row">{row.label}</th>
                    {products.map((product) => (
                        <td key={product.id}>{row.values[String(product.id)]}</td>
                    ))}
                </tr>
            ))}
        </tbody>
    </table>
</div>
~~~

Keep product summary cards above the matrix. Add aria-pressed to the differences
toggle, aria-live="polite" to loading/error status, meaningful image alt text,
and accessible labels for every remove action.

- [ ] Step 5: Implement ProductComparisonPage state.

1. Parse ids from useLocation().search.
2. Call comparison.replace(ids) after sanitizing URL values.
3. Render empty/one-product state without an invalid request.
4. Fetch with fetchProductComparison(selectedIds) when IDs change.
5. Map response.data.code to localized mismatch, not-found, invalid-link, or retry state.
6. Build rows and filter isDifferent when the toggle is active.
7. Use useCart().addItem(product.id, 1), checking available_stock first.
8. Use formatCurrency for current VND price and show sale_price only when lower.
9. Provide links to /shops and product detail URLs.

- [ ] Step 6: Add responsive and theme-safe SCSS.

Create BEM styles for comparison-page, comparison-product,
comparison-table, and comparison-tray. Implement desktop four-column layout
with sticky first column, mobile overflow-x auto only on
comparison-table__viewport, 44px controls, single-line labels, explicit
hover/focus-visible/pressed/disabled/out-of-stock colors using existing semantic
variables, reduced-motion support, and readable dark/light states.

- [ ] Step 7: Run tests and checks.

~~~powershell
pnpm --dir client exec vitest run src/features/products/pages/__tests__/ProductComparisonPage.test.tsx src/features/products/compare/compareMatrix.test.ts src/context/__tests__/ComparisonContext.test.tsx src/components/common/__tests__/ProductCard.test.tsx
pnpm --dir client exec tsc -p tsconfig.json --noEmit
~~~

Expected: PASS with no TypeScript errors.

- [ ] Step 8: Commit the storefront UI.

~~~powershell
git add client/src/features/products client/src/styles/pages/_comparison.scss client/src/i18n/en.ts client/src/i18n/vi.ts client/src/components/common/ProductCard.tsx client/src/components/common/__tests__/ProductCard.test.tsx client/src/features/products/pages/ProductPage.tsx client/src/routes/router.tsx
git commit -m "feat(products): add responsive comparison experience"
~~~

## Task 7: Update API/Wiki documentation and run full verification

**Files:**
- Modify: docs/API.md
- Modify: Wiki/concepts/order-lifecycle-and-support.md
- Modify: Wiki/architecture.md
- Modify: Wiki/index.md
- Modify: Wiki/log.md

**Interfaces:**
- Consumes: final API, frontend state, business rules, and verification evidence.
- Produces: maintainable docs with no stale deferred-comparison claim.

- [ ] Step 1: Document the endpoint.

Add to docs/API.md:

~~~markdown
### GET /api/products/compare?ids=12,18,24

- Public read-only endpoint; no authentication required.
- ids is a comma-separated list of two to four distinct positive product IDs.
- Products must exist in the public catalog and share one category.
- Response uses current product data, available stock, VND prices, review summary,
  warranty, and normalized attributes.
- Errors: COMPARE_INVALID_IDS (400), COMPARE_PRODUCTS_NOT_FOUND (404),
  COMPARE_CATEGORY_MISMATCH (422).
~~~

- [ ] Step 2: Update Wiki.

Replace the deferred-work statement, link the architecture page to the API
contract, append a dated line to Wiki/log.md, and update Wiki/index.md date and
capability list. Use Obsidian wikilinks for Wiki-to-Wiki links.

- [ ] Step 3: Run documentation checks.

~~~powershell
git diff --check
~~~

Expected: no whitespace errors, no secrets or personal data, and all added Wiki
links use the existing wikilink convention.

- [ ] Step 4: Run package verification.

~~~powershell
pnpm --dir client exec vitest run --config vitest.config.ts
pnpm --dir client exec tsc -p tsconfig.json --noEmit
pnpm --dir client build
pnpm --dir server exec vitest run src/products/__tests__/products.compare.test.ts src/products/__tests__/products.compare.service.test.ts src/products/__tests__/products.compare.controller.test.ts
pnpm --dir server typecheck
pnpm --dir server build
~~~

Expected: all commands pass. Report the exact command and blocker if a local
service or dependency prevents a check.

- [ ] Step 5: Run Playwright browser verification.

Start the independent client/server processes according to AGENTS.md. Verify
at 1440x900, 1920x1080, and a mobile viewport:

1. Open /shops, add one product, add a second same-category product, and open /compare.
2. Verify order, VND prices, sale-price hierarchy, reviews, warranty, missing-value em dash, and stock state.
3. Attempt a fifth product and a different-category product; confirm localized feedback and unchanged selection.
4. Remove one item, clear all, reload, and open a copied /compare?ids= URL.
5. Toggle differences-only, add an in-stock product to cart, and verify out-of-stock is disabled.
6. Repeat key checks in EN/VI and dark/light themes.
7. Confirm no body-level horizontal overflow, clipped text, two-line labels, invisible hover text, or missing keyboard focus ring.

- [ ] Step 6: Review and commit documentation.

~~~powershell
git status --short
git diff --stat
git diff --check
git add docs/API.md Wiki
git commit -m "docs(products): document product comparison"
~~~

## Self-review checklist

- Spec coverage: Tasks 1–2 cover backend validation/API; Task 3 covers data and
  matrix normalization; Task 4 covers selection/tray; Task 5 covers entry points
  and routing; Task 6 covers UI, responsive behavior, i18n, themes, accessibility
  and error states; Task 7 covers docs and verification.
- No placeholders: every task names exact files, commands, expected outcomes,
  public interfaces, and implementation/test details.
- Type consistency: fetchProductComparison returns ProductComparison; the context
  exposes selectedIds and canCompare; ComparisonTable consumes
  ComparisonMatrixRow[]; backend errors use three fixed codes.
- Security: the endpoint is read-only, IDs are parameterized and bounded to four,
  no auth/CSRF exception is added, and client data is not trusted for price,
  stock, category, or attributes.
- Scope: no payment change, schema migration, dependency, account persistence,
  or unrelated storefront refactor is included.
