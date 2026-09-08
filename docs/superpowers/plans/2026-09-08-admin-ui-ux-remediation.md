# Admin UI/UX Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Make all Digital-E Admin routes permission-safe, truthful about API state, usable at desktop and mobile sizes, and verifiable through Playwright at exactly 1920x1080.

**Architecture:** Add a component-level RequireAdmin boundary that uses the existing AuthContext, because the app currently uses component-based Routes rather than a React Router data router. Keep Admin API ownership in the existing feature pages, add a small shared status presentation layer for loading/error/empty states, and preserve the backend's existing AuthGuard/RolesGuard authorization.

**Tech Stack:** React 19, React Router DOM 7, TypeScript, Vite, React Bootstrap-compatible form wrappers, SCSS, Vitest, Testing Library, Playwright CLI.

**Spec:** docs/superpowers/specs/2026-09-08-admin-ui-ux-remediation-design.md

## Global Constraints

- Use Node.js 24.20.0 and pnpm 12.3.4; do not add npm or yarn lockfiles.
- Do not add a data-fetching library or migrate to React Router data routers for this remediation.
- Preserve existing API paths, response keys, backend authorization, CSRF flow, cookies, and route aliases.
- Treat AuthContext as the client session source of truth; do not make Firebase currentUser a prerequisite for a valid local-password Admin session.
- Required Add Product fields must match the server productCreateSchema: name, category, brand, price, and inventory.
- Do not convert rejected API requests into valid-looking empty arrays, zero values, or “no activity” states.
- Preserve unrelated dirty changes currently present in the workspace; touch only paths listed by a task.
- Do not use privileged credentials found in source against production. Authenticated browser verification requires a user-authorized test account or an explicitly authorized local fixture.
- Playwright's primary visual gate is exactly 1920x1080; also run the specified 390x844 mobile regression.
- Do not commit, push, merge, or deploy unless the user separately authorizes that action.

---

### Task 1: Add the Admin route boundary and forbidden route

**Files:**
- Create: client/src/features/auth/components/RequireAdmin.tsx
- Create: client/src/features/auth/components/RequireAdmin.test.tsx
- Create: client/src/features/auth/authRedirect.ts
- Create: client/src/features/auth/authRedirect.test.ts
- Create: client/src/pages/ForbiddenPage.tsx
- Modify: client/src/routes/router.tsx
- Modify: client/src/routes/router.test.tsx
- Modify: client/src/features/auth/pages/LoginPage.tsx

**Interfaces:**
- RequireAdmin consumes AuthContext, Role, useLocation, Navigate, and LoadingScreen.
- RequireAdmin produces loading, login redirect, forbidden redirect, or children.
- getSafeRedirectTarget(value: string | null): string | null accepts only internal paths beginning with / and rejects protocol-relative values beginning with //.
- Login consumes getSafeRedirectTarget and falls back to /admin for Admin or / for Customer.

- [ ] **Step 1: Write failing guard tests.**

Render RequireAdmin with a mocked useAuth result and a MemoryRouter. Cover:

~~~tsx
it("shows the page loading state while auth is resolving", () => {
    renderWithAuth({ loading: true, userData: null });
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
});

it("redirects anonymous users to login with the current internal route", () => {
    renderWithAuth({ loading: false, userData: null }, ["/admin/orders?status=pending"]);
    expect(screen.getByTestId("location")).toHaveTextContent(
        "/login?redirect=%2Fadmin%2Forders%3Fstatus%3Dpending",
    );
});

it("redirects customers to the forbidden page", () => {
    renderWithAuth({ loading: false, userData: buildUser({ role: Role.Customer }) });
    expect(screen.getByTestId("location")).toHaveTextContent("/403");
});

it("renders Admin children for an Admin user", () => {
    renderWithAuth({ loading: false, userData: buildUser({ role: Role.Admin }) });
    expect(screen.getByTestId("admin-child")).toBeInTheDocument();
});
~~~

- [ ] **Step 2: Run the focused tests and verify they fail for the missing boundary.**

Run:

~~~powershell
client\node_modules\.bin\vitest.cmd run client/src/features/auth/components/RequireAdmin.test.tsx client/src/features/auth/authRedirect.test.ts
~~~

Expected: FAIL because the boundary and redirect helper do not exist yet.

- [ ] **Step 3: Implement the safe redirect helper.**

Create authRedirect.ts with this behavior:

~~~ts
export function getSafeRedirectTarget(value: string | null): string | null {
    if (!value || !value.startsWith("/") || value.startsWith("//")) {
        return null;
    }

    return value;
}
~~~

Add tests for null, /admin, /admin/orders?status=pending, https://example.com, and //example.com.

- [ ] **Step 4: Implement RequireAdmin.**

Use the existing AuthContext and render no Admin page while auth is loading:

~~~tsx
const RequireAdmin = ({ children }: { children: React.ReactNode }) => {
    const { userData, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return <LoadingScreen variant="page" />;
    }

    if (!userData) {
        const redirect = location.pathname + location.search + location.hash;
        const loginPath = "/login?redirect=" + encodeURIComponent(redirect);
        return <Navigate to={loginPath} replace />;
    }

    if (userData.role !== Role.Admin) {
        return <Navigate to="/403" replace />;
    }

    return <>{children}</>;
};
~~~

Keep the component independent from getFirebaseAuth; local-password sessions must pass when AuthContext has an Admin user.

- [ ] **Step 5: Add the forbidden page and wire Admin routes.**

Create a public, non-Admin-shell ForbiddenPage with:

- a clear “Access denied” heading;
- an explanation that the signed-in account is not an Admin;
- a button to /;
- a button to /account for Customer users.

Import it into router.tsx, add /403, remove the Admin route constants that wrap pages with withSessionCheck, and render each Admin page inside RequireAdmin:

~~~tsx
<Route
    path="/admin/orders"
    element={
        <RequireAdmin>
            <AdminOrderPage />
        </RequireAdmin>
    }
/>
~~~

Keep the existing withSessionCheck wrappers for customer-only protected routes in this task.

- [ ] **Step 6: Implement login return navigation.**

Read useLocation() in LoginPage, derive a safe target from the query string, and preserve the existing role-based fallback:

~~~ts
const requestedPath = getSafeRedirectTarget(
    new URLSearchParams(location.search).get("redirect"),
);
const destination = userDataResult?.role === Role.Admin
    ? requestedPath || "/admin"
    : "/";
navigate(destination, { replace: true });
~~~

Never navigate to an external or protocol-relative URL from the query string.

- [ ] **Step 7: Update route tests and run the focused suite.**

Replace the current withSessionCheck mock assumptions for Admin routes with RequireAdmin tests. Verify public routes remain public and customer protected routes remain protected.

Run:

~~~powershell
client\node_modules\.bin\vitest.cmd run client/src/features/auth client/src/routes/router.test.tsx
client\node_modules\.bin\tsc.cmd -p client\tsconfig.json --noEmit
~~~

Expected: all focused auth/router tests pass and TypeScript exits 0.

---

### Task 2: Add shared Admin request-state UI and migrate initial-load errors

**Files:**
- Create: client/src/features/admin/components/AdminStatusPanel.tsx
- Create: client/src/features/admin/components/AdminStatusPanel.test.tsx
- Create: client/src/features/admin/utils/adminRequestError.ts
- Create: client/src/features/admin/utils/adminRequestError.test.ts
- Create: client/src/features/admin/pages/AdminNotificationsPage.test.tsx
- Create: client/src/features/admin/pages/AdminSupportPage.test.tsx
- Create: client/src/features/admin/pages/AdminProductPage.test.tsx
- Modify: client/src/features/admin/pages/AdminNotificationsPage.tsx
- Modify: client/src/features/admin/pages/AdminSupportPage.tsx
- Modify: client/src/features/admin/pages/AdminAccountPage.tsx
- Modify: client/src/features/admin/pages/AdminOrderPage.tsx
- Modify: client/src/features/admin/pages/AdminPromotionsPage.tsx
- Modify: client/src/features/admin/pages/AdminProductPage.tsx
- Modify: client/src/components/layout/AdminHeader.tsx

**Interfaces:**
- AdminStatusPanel accepts variant loading, error, or empty, a title, description, optional retry action, and optional retryLabel.
- getAdminRequestError(error: unknown) returns kind auth, forbidden, network, or unknown with a title and message.
- Each migrated page keeps its own domain data and exposes a retry callback without changing API response shapes.

- [ ] **Step 1: Write status-panel and error-classification tests.**

Cover the three panel variants, the Retry button callback, role alert for errors, and status classification for Axios-like objects with status 401, 403, 500, and no response.

~~~ts
expect(getAdminRequestError({ response: { status: 401 } })).toMatchObject({ kind: "auth" });
expect(getAdminRequestError({ response: { status: 403 } })).toMatchObject({ kind: "forbidden" });
expect(getAdminRequestError({ response: { status: 500 } })).toMatchObject({ kind: "unknown" });
~~~

- [ ] **Step 2: Run the focused tests and verify they fail.**

Run:

~~~powershell
client\node_modules\.bin\vitest.cmd run client/src/features/admin/components/AdminStatusPanel.test.tsx client/src/features/admin/utils/adminRequestError.test.ts
~~~

Expected: FAIL because the shared component and classifier do not exist yet.

- [ ] **Step 3: Implement the shared status presentation.**

Keep the component presentational. An error state must not render the caller's empty table below it unless the caller has previous successful data. Use existing Admin classes and add a focused class only when needed:

~~~tsx
{variant === "error" ? (
    <div className="admin__status-panel admin__status-panel--error" role="alert">
        <strong>{title}</strong>
        <p>{description}</p>
        {onRetry ? (
            <button type="button" onClick={onRetry}>{retryLabel}</button>
        ) : null}
    </div>
) : null}
~~~

- [ ] **Step 4: Migrate each page's initial fetch state.**

For Orders, Accounts, Promotions, Support, and Admin Notifications:

1. Add loadError state.
2. Clear it before a retry.
3. Set it through getAdminRequestError in the catch branch.
4. Render AdminStatusPanel when the initial request fails and no prior data exists.
5. Render a compact refresh banner while preserving prior data if a later refresh fails.
6. Render the existing empty state only after a fulfilled request returns an empty array.

For Product inventory movements, add an independent inventoryMovementsError state. Do not replace a failed movement request with setInventoryMovements([]).

- [ ] **Step 5: Fix the Admin header activity-feed state.**

Add activityStatus and activityError. On initial fetchAdminAlerts failure, the popover must show a retryable error rather than No new notifications right now. On a successful empty response, it may show the empty copy. During a later refresh failure, preserve the last successful activities and show the retry state above them.

- [ ] **Step 6: Add representative page-state tests.**

Add or extend tests for:

- Notifications rejected request -> retryable error, no No matching notifications.
- Support rejected request -> retryable error, no No support tickets match this filter.
- Product movement rejected request -> inventory error, no No inventory movements recorded yet.
- Successful empty response -> the existing empty state remains visible.

Mock only the feature API functions; do not bypass the component state with DOM-only snapshots.

- [ ] **Step 7: Run focused tests and lint the changed files.**

Run:

~~~powershell
client\node_modules\.bin\vitest.cmd run client/src/features/admin/components/AdminStatusPanel.test.tsx client/src/features/admin/pages client/src/components/layout/AdminHeader.test.tsx
client\node_modules\.bin\eslint.cmd client/src/features/admin client/src/components/layout/AdminHeader.tsx --ext .ts,.tsx --format=pretty
~~~

Expected: tests pass; lint has no new errors. Existing warnings may remain, but the task must not add error diagnostics.

---

### Task 3: Make Dashboard partial failures truthful

**Files:**
- Create: client/src/features/admin/utils/dashboardAvailability.ts
- Create: client/src/features/admin/utils/dashboardAvailability.test.ts
- Create: client/src/features/admin/pages/AdminDashboard.test.tsx
- Modify: client/src/features/admin/pages/AdminDashboard.tsx
- Modify: client/src/features/admin/components/AdminDashboardCharts.tsx

**Interfaces:**
- DashboardSectionKey is analytics, products, orders, users, or orderItems.
- DashboardSectionStatus is loading, success, or error.
- DashboardAvailability is a record keyed by DashboardSectionKey.
- displayDashboardValue(status, value) returns the numeric/string value for success and Unavailable for error.
- getDashboardUpdateLabel(availability) returns Updated, Partially updated, or Unable to load.
- Chart consumers receive explicit availability rather than inferring failure from an empty array.

- [ ] **Step 1: Write failing availability tests.**

Test that a successful zero is displayed as 0, a rejected source is displayed as Unavailable, and a mixed result is classified as partial rather than fully updated:

~~~ts
expect(displayDashboardValue("success", 0)).toBe(0);
expect(displayDashboardValue("error", 0)).toBe("Unavailable");
expect(getDashboardUpdateLabel({
    analytics: "success",
    products: "success",
    orders: "error",
    users: "success",
    orderItems: "success",
})).toBe("Partially updated");
~~~

- [ ] **Step 2: Run the focused tests and verify they fail.**

Run:

~~~powershell
client\node_modules\.bin\vitest.cmd run client/src/features/admin/utils/dashboardAvailability.test.ts
~~~

Expected: FAIL because the availability utility does not exist.

- [ ] **Step 3: Implement explicit section-status helpers.**

Represent Promise.allSettled results by section name. Do not use array position at render time; create a named result map so later changes cannot silently associate the wrong status with a metric.

- [ ] **Step 4: Update fetchDashboardData.**

Initialize all five section statuses to loading, then set each section independently:

~~~ts
const [analyticsResult, productResult, orderResult, userResult, orderItemResult] = await Promise.allSettled([
    fetchAnalyticsSummary(),
    fetchAdminProducts(1, 60),
    fetchAdminOrders(1, 80),
    fetchAdminUsers(1, 80),
    fetchOrderItems(1, 120),
]);

setSectionStatus((current) => ({
    ...current,
    analytics: analyticsResult.status === "fulfilled" ? "success" : "error",
    products: productResult.status === "fulfilled" ? "success" : "error",
    orders: orderResult.status === "fulfilled" ? "success" : "error",
    users: userResult.status === "fulfilled" ? "success" : "error",
    orderItems: orderItemResult.status === "fulfilled" ? "success" : "error",
}));
~~~

Only assign data from fulfilled results. Preserve previous successful data during a refresh failure. Set lastUpdated only when at least one section succeeds and compute the label from the full status map.

- [ ] **Step 5: Prevent failed sources from entering fallback calculations.**

Use these rules in KPI and chart preparation:

- analyticsStatus error means analytics KPIs/charts are unavailable.
- ordersStatus error means order-derived sales/revenue/status charts are unavailable.
- productsStatus error means inventory/product metrics are unavailable.
- Local calculations are fallback data only when the corresponding request succeeded but returned no usable analytics payload.

Pass availability into AdminDashboardCharts and render Unavailable or an inline section error instead of empty chart axes that look like valid zero data.

- [ ] **Step 6: Add a rendered dashboard test for mixed results.**

Mock product API success with known products and mock analytics/orders/users/order-item APIs with 401 rejection. Assert:

- products can render their real count;
- failed user/order/analytics sections show unavailable messaging;
- the page says Partially updated rather than Updated;
- no failed section is rendered as a valid 0 metric.

- [ ] **Step 7: Run focused tests and typecheck.**

Run:

~~~powershell
client\node_modules\.bin\vitest.cmd run client/src/features/admin/utils/dashboardAvailability.test.ts client/src/features/admin/pages/AdminDashboard.test.tsx
client\node_modules\.bin\tsc.cmd -p client\tsconfig.json --noEmit
~~~

Expected: all focused tests pass and TypeScript exits 0.

---

### Task 4: Correct Admin interaction, responsive layout, pagination, and accessibility

**Files:**
- Create: client/src/features/admin/components/AdminTableScrollHint.tsx
- Create: client/src/features/admin/components/AdminTableScrollHint.test.tsx
- Create: client/src/components/layout/AdminHeader.test.tsx
- Modify: client/src/components/layout/AdminHeader.tsx
- Modify: client/src/components/layout/AdminSidebar.tsx
- Modify: client/src/features/admin/pages/AdminNotificationsPage.tsx
- Modify: client/src/features/admin/pages/AdminProductPage.tsx
- Modify: client/src/features/admin/pages/AdminOrderPage.tsx
- Modify: client/src/features/admin/pages/AdminAccountPage.tsx
- Modify: client/src/features/admin/pages/AdminPromotionsPage.tsx
- Modify: client/src/features/admin/pages/AdminSupportPage.tsx
- Modify: client/src/styles/layout/_admin-shell.scss
- Modify: client/src/styles/features/admin/_shell.scss
- Modify: client/src/styles/components/_toast.scss

**Interfaces:**
- AdminTableScrollHint accepts label, children, and an accessible region label, and produces a focusable horizontal-scroll region without changing table data behavior.
- Sidebar navigation uses NavLink active semantics or equivalent aria-current page semantics.
- Header search remains a section navigator and exposes that meaning through label, placeholder, and button name.

- [ ] **Step 1: Write failing interaction and accessibility tests.**

Cover:

- Header search uses section-navigation copy and maps laptop to the documented Dashboard fallback without claiming a data search.
- Sidebar active route exposes aria-current page.
- Notification filters expose role tab and aria-selected.
- Table hint contains the horizontal-scroll guidance.
- Pagination is absent when pageCount <= 1.

- [ ] **Step 2: Run the focused tests and capture current failures/warnings.**

Run:

~~~powershell
client\node_modules\.bin\vitest.cmd run client/src/components/layout/AdminHeader.test.tsx client/src/features/admin/components/AdminTableScrollHint.test.tsx client/src/features/admin/pages
~~~

Expected: new assertions fail or expose the current ReactPaginate empty-page warning.

- [ ] **Step 3: Relabel and constrain header search.**

Change the screen-reader label, placeholder, and submit button label to communicate section navigation. Keep the existing keyword map for products, orders, and accounts. For an unknown keyword, navigate to Dashboard and show a small non-blocking clarification rather than implying a record search.

- [ ] **Step 4: Convert sidebar navigation to navigation semantics.**

Replace each navigation button with NavLink using end for /admin, preserve the existing item classes, and let the route determine active state. Remove the now-unused manual useLocation matching logic. Verify the active link exposes aria-current page.

- [ ] **Step 5: Complete notification tab and popover semantics.**

For AdminNotificationsPage:

- add role tab, stable IDs, and aria-selected to each filter button;
- connect tabs to the filtered panel with aria-controls and role tabpanel where appropriate.

For AdminHeader:

- add a stable dialog ID and labelled-by relationship;
- close on Escape;
- return focus to the bell trigger after close;
- preserve the existing Open center and Refresh actions.

- [ ] **Step 6: Fix pagination and table scroll affordances.**

Wrap each ReactPaginate instance in a condition equivalent to:

~~~tsx
{pageCount > 1 ? (
    <ReactPaginate pageCount={pageCount} forcePage={currentPage - 1} />
) : null}
~~~

Keep current-page clamping for filtered results. Wrap complex tables in AdminTableScrollHint, use tabIndex 0, and display Swipe horizontally to view more columns at narrow widths. Keep the existing overflow-x auto container and ensure document.documentElement.scrollWidth does not exceed the viewport.

- [ ] **Step 7: Add toolbar and mobile-shell layout rules.**

Add explicit rules for the classes currently sharing only border/background tokens:

~~~scss
.admin__list-toolbar {
    display: flex;
    align-items: flex-end;
    gap: 0.75rem;
    flex-wrap: wrap;
}

.admin__filters {
    display: flex;
    align-items: flex-end;
    gap: 0.6rem;
    flex: 1 1 24rem;
    min-width: 0;
}

.admin__filters input {
    flex: 1 1 16rem;
    min-width: 0;
}

@media (max-width: 720px) {
    .admin__list-toolbar,
    .admin__filters {
        align-items: stretch;
        flex-direction: column;
    }

    .admin__filters > * {
        width: 100%;
    }
}
~~~

Reduce unnecessary mobile header stacking while keeping Storefront, search, notifications, profile, and Logout reachable. Use the existing breakpoints instead of adding a new responsive system. Make mobile action toasts full-width within safe margins; initial-load errors are already inline from Task 2.

- [ ] **Step 8: Run focused tests and lint.**

Run:

~~~powershell
client\node_modules\.bin\vitest.cmd run client/src/components/layout/AdminHeader.test.tsx client/src/features/admin/components/AdminTableScrollHint.test.tsx client/src/features/admin/pages
client\node_modules\.bin\eslint.cmd client/src/components/layout client/src/features/admin --ext .ts,.tsx --format=pretty
~~~

Expected: no ReactPaginate empty-page warning in the test output and no new lint errors.

---

### Task 5: Align Add Product validation with the server contract

**Files:**
- Create: client/src/features/admin/utils/validateAddProduct.ts
- Create: client/src/features/admin/utils/validateAddProduct.test.ts
- Modify: client/src/features/admin/pages/AdminAddProductPage.tsx
- Create: client/src/features/admin/pages/AdminAddProductPage.test.tsx

**Interfaces:**
- AddProductValidationInput contains name, category, brand, price, and inventory.
- validateAddProduct(input) returns Partial<Record<AddProductField, string>>.
- Empty strings are invalid for text fields; price and inventory accept 0 but reject non-finite, negative, and non-integer inventory values.

- [ ] **Step 1: Write failing validation tests.**

Cover:

~~~ts
expect(validateAddProduct({
    name: "",
    category: "GPU",
    brand: "Example",
    price: 10,
    inventory: 2,
})).toHaveProperty("name");

expect(validateAddProduct({
    name: "Card",
    category: "GPU",
    brand: "Example",
    price: 0,
    inventory: 0,
})).toEqual({});

expect(validateAddProduct({
    name: "Card",
    category: "",
    brand: "Example",
    price: -1,
    inventory: 1.5,
})).toMatchObject({
    category: expect.any(String),
    price: expect.any(String),
    inventory: expect.any(String),
});
~~~

- [ ] **Step 2: Run the focused tests and verify they fail.**

Run:

~~~powershell
client\node_modules\.bin\vitest.cmd run client/src/features/admin/utils/validateAddProduct.test.ts
~~~

Expected: FAIL because the validator does not exist.

- [ ] **Step 3: Implement the pure validator.**

Trim required text fields, preserve zero as a valid numeric value, and return field-specific messages. Do not duplicate server persistence or upload rules in the validator.

- [ ] **Step 4: Align the form labels and controls.**

In AdminAddProductPage:

- keep * on Product Name, Category, Brand, Price, and Inventory Quantity;
- remove * from Description and Product Image;
- add required to the five actual required controls;
- add min=0, step=0.01 to price and min=0, step=1 to inventory;
- add aria-invalid and a linked error message when custom validation fails.

- [ ] **Step 5: Validate before constructing FormData.**

At the start of handleSubmit, call validateAddProduct. If errors exist:

1. set the first validation message in the existing inline error area;
2. focus the first invalid control by its stable ID;
3. return without calling addProduct or showing an upload/product mutation toast.

Only construct FormData after validation passes. Keep server-side validation authoritative and preserve the existing success navigation.

- [ ] **Step 6: Add rendered form tests.**

Mock addProduct and render the page with the existing providers/mocks. Assert:

- empty submission does not call addProduct;
- actual required controls expose required;
- optional description/image can remain empty;
- valid zero price and inventory are accepted by the client validator;
- an API rejection still shows the existing mutation error path.

- [ ] **Step 7: Run focused tests and typecheck.**

Run:

~~~powershell
client\node_modules\.bin\vitest.cmd run client/src/features/admin/utils/validateAddProduct.test.ts client/src/features/admin/pages/AdminAddProductPage.test.tsx
client\node_modules\.bin\tsc.cmd -p client\tsconfig.json --noEmit
~~~

Expected: all focused tests pass and TypeScript exits 0.

---

### Task 6: Run the full verification gate and Playwright at 1920x1080

**Files:**
- Create: output/playwright/admin-remediation/ artifacts only; do not add browser artifacts to source directories.
- Review: all files changed by Tasks 1–5.

**Interfaces:**
- Playwright CLI session name: admin-remediation.
- Required desktop viewport: 1920 1080.
- Required mobile regression viewport: 390 844.
- Required desktop screenshots: Dashboard, Products, Orders, Notifications, Add Product, and one error/empty-state example.

- [ ] **Step 1: Run the full client static and test checks.**

Run:

~~~powershell
client\node_modules\.bin\tsc.cmd -p client\tsconfig.json --noEmit
client\node_modules\.bin\eslint.cmd client/src --ext .js,.mjs,.cjs,.ts,.mts,.cts,.jsx,.tsx --format=pretty
Set-Location client
.\node_modules\.bin\vitest.cmd run
Set-Location ..
corepack.cmd pnpm --dir client build
~~~

Expected: TypeScript, Vitest, and build pass; ESLint has no errors. Existing warnings must be reported rather than silently treated as clean.

- [ ] **Step 2: Start the local client and open a named Playwright session.**

Use the project runtime:

~~~powershell
corepack.cmd pnpm --dir client dev --host 127.0.0.1
~~~

In a second terminal, use the Windows-compatible Playwright CLI fallback used by the audit:

~~~powershell
corepack.cmd pnpm dlx --yes @playwright/cli --session admin-remediation open http://127.0.0.1:5173/admin --headed
corepack.cmd pnpm dlx --yes @playwright/cli --session admin-remediation resize 1920 1080
corepack.cmd pnpm dlx --yes @playwright/cli --session admin-remediation snapshot
~~~

If the wrapper script is available in the environment, it may be used instead; the required session and viewport remain unchanged.

- [ ] **Step 3: Verify the unauthenticated redirect at 1920x1080.**

For each Admin route, open the route, snapshot after navigation, and assert:

- the URL is /login?redirect=...;
- no admin__layout shell is present;
- the original route is encoded in the redirect value;
- no uncaught console error is introduced by the guard.

Run the route sweep for:

~~~text
/admin
/admin/notifications
/admin/support
/admin/products
/admin/orders
/admin/accounts
/admin/promotions
/admin/add
~~~

- [ ] **Step 4: Verify the authenticated Admin visual surface at 1920x1080.**

Use only an authorized test account or an explicitly authorized local fixture. After authentication, capture screenshots with exact viewport dimensions:

~~~powershell
corepack.cmd pnpm dlx --yes @playwright/cli --session admin-remediation screenshot --filename=output/playwright/admin-remediation/admin-dashboard-1920x1080.png --full-page=false
~~~

Repeat for Products, Orders, Notifications, Add Product, and the chosen error/empty state. For each page verify:

- no document-level horizontal overflow;
- no toast/banner overlaps the heading or primary actions;
- header search copy describes section navigation;
- filters and table actions remain visible;
- pagination does not render for zero/one-page results;
- error state and empty state copy are not conflated;
- the page title and primary action are visible without unexpected clipping.

- [ ] **Step 5: Run the mobile regression at 390x844.**

Run:

~~~powershell
corepack.cmd pnpm dlx --yes @playwright/cli --session admin-remediation resize 390 844
corepack.cmd pnpm dlx --yes @playwright/cli --session admin-remediation reload
corepack.cmd pnpm dlx --yes @playwright/cli --session admin-remediation snapshot
~~~

Verify the Admin shell, toolbars, table scroll hints, notification popover, Add Product form, and inline errors. Capture at least admin-orders-mobile-390x844.png and admin-products-mobile-390x844.png.

- [ ] **Step 6: Re-read the diff and record verification boundaries.**

Confirm:

- no unrelated dirty file was modified;
- no secret or credential was added;
- backend authorization and CSRF behavior remain unchanged;
- authenticated mutation verification is labelled as blocked if no authorized account was supplied;
- all command results and Playwright artifact paths are included in the final report.

No commit, deployment, merge, or push occurs in this task without separate user authorization.
