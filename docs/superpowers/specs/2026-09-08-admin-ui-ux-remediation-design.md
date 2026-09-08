# Admin UI/UX Remediation Design

**Status:** Direction approved by the user; implementation is not started.

**Date:** 2026-09-08

## Goal

Make the Digital-E Admin experience truthful, permission-safe, usable at desktop and mobile sizes, and consistent when API requests are loading, empty, forbidden, or failed.

## Evidence and scope

This design is based on the source audit and live browser audit of these deployed routes:

- `/admin`
- `/admin/notifications`
- `/admin/support`
- `/admin/products`
- `/admin/orders`
- `/admin/accounts`
- `/admin/promotions`
- `/admin/add`

The deployed audit was unauthenticated. Protected backend endpoints returned `401`, while the client still rendered the Admin shell and several empty or zero-valued states. Authenticated CRUD, upload, restock, order status, account, promotion, and support mutations require an authorized test account before production verification.

## User-approved decisions

- Follow the minimal-remediation approach on the existing React/Vite architecture.
- Unauthenticated access to `/admin/*` redirects to `/login?redirect=<internal-admin-path>`.
- An authenticated non-admin user is redirected to `/403`.
- An authenticated Admin user can render the requested Admin route.
- The Admin header search remains a section navigator for this phase. It is relabeled as navigation and does not promise global data search.
- Playwright verification must include a desktop viewport of exactly `1920x1080`.

## Non-goals

- Do not migrate the application from component-based `<Routes>` to React Router data routers.
- Do not add a data-fetching library for this remediation.
- Do not redesign every Admin table into cards.
- Do not change backend authorization rules that already return `401`/`403` correctly.
- Do not add a global cross-entity search API in this phase.
- Do not add server-side Admin alert read persistence unless a separate product decision requires it.

## Architecture

The client will add a dedicated Admin route boundary that uses the existing `AuthContext` rather than the Firebase-only check in `withSessionCheck`. The backend remains the source of authorization truth; the client guard exists to prevent unauthorized Admin UI from rendering and to provide a useful redirect experience.

Admin pages will retain their existing feature ownership and local API functions. A small shared presentation layer will make request states explicit, while each page keeps control of its domain data and retry behavior. This avoids a broad state-management migration and keeps the remediation reviewable.

## Workstreams

### 1. Admin authorization boundary

**Files and responsibilities:**

- Create `client/src/features/auth/components/RequireAdmin.tsx` for loading, unauthenticated, non-admin, and admin branches.
- Create `client/src/pages/ForbiddenPage.tsx` for the `/403` experience.
- Modify `client/src/routes/router.tsx` so Admin routes use `RequireAdmin` while existing customer protected routes remain unchanged.
- Modify `client/src/features/auth/pages/LoginPage.tsx` to consume a safe internal `redirect` query value after successful login.
- Add or update route and guard tests under `client/src/features/auth` and `client/src/routes`.

**Behavior:**

1. While `AuthContext.loading` is true, render the existing page loading state.
2. When loading completes with no `userData`, navigate to `/login?redirect=<encoded-path-and-query>` using `replace`.
3. When loading completes with `userData.role !== Role.Admin`, navigate to `/403` using `replace`.
4. When the role is Admin, render the route element.
5. Login redirect handling must accept only an internal path beginning with `/`; external URLs and malformed values fall back to the role-based default (`/admin` for Admin, `/` for Customer).

The guard should not rely on `getFirebaseAuth().currentUser`: local-password sessions are valid Admin sessions even when Firebase has no current user.

### 2. Truthful loading, error, empty, and partial states

**Shared UI:**

- Create a focused Admin status component, such as `client/src/features/admin/components/AdminStatusPanel.tsx`, with explicit variants for `loading`, `error`, and `empty`.
- Error panels include a human-readable message and a Retry action when the page can retry.
- Empty panels are rendered only after a successful request whose result is empty.
- Initial-load errors are inline page content, not toast-only notifications.
- Mutation failures may continue to use toasts because the user has an active action context.

**Per-page rules:**

- Orders, Accounts, Promotions, Support, and Admin Notifications must store an explicit load error instead of leaving an empty array that looks valid.
- Product inventory movements must distinguish “no movements” from “could not load movements”.
- A failed refresh with previously loaded data keeps the stale data visible and adds a non-blocking “Unable to refresh” banner; it must not erase known-good data.
- `401`/`403` messages must use session/permission language, while other errors use retry language.

**Dashboard rules:**

- Keep the existing parallel fetch strategy, but record a status for analytics, products, orders, users, and order items independently.
- A fulfilled request with a real zero remains `0`.
- A rejected request renders `Unavailable` or an equivalent unavailable state, never a fake zero.
- Analytics-derived charts and KPIs must not fall back to empty computed arrays when their source request failed.
- Local fallback calculations are allowed only when the source request succeeded but legitimately returned no analytics payload.
- The dashboard shows `Updated`, `Partially updated`, or `Unable to load` based on the section statuses. “Updated” is not allowed when required sections failed.
- A page-level Retry action reruns the failed sections and preserves successful sections.

The design follows the existing React component architecture and current React guidance to model async state explicitly rather than treating rejected data as an empty success state.

### 3. Admin interaction and responsive UX

**Header search:**

- Keep the current keyword-to-section routing map.
- Change the accessible label and visible placeholder to communicate navigation, for example `Jump to Products, Orders, or Accounts`.
- Unknown keywords should either stay on Dashboard with a clear “Choose a section” message or be documented as Dashboard fallback; they must not imply that a data search occurred.

**Toolbars:**

- Add shared layout rules for `.admin__list-toolbar` and `.admin__filters`.
- Desktop: filters use a horizontal flex layout; the text input grows with `flex: 1` and controls retain stable widths.
- Mobile: filters stack vertically with full-width controls and no placeholder clipping.

**Pagination:**

- Render ReactPaginate only when `pageCount > 1`.
- Keep current page clamping behavior when filters reduce the result set.
- The empty state must not pass `forcePage=0` together with `pageCount=0`.

**Tables on narrow viewports:**

- Preserve the existing horizontal scroll container for complex Admin tables.
- Add an accessible, visually compact hint such as `Swipe horizontally to view more columns` when the table is wider than its container.
- Give the scroll region a meaningful accessible label and keyboard focus behavior.
- Do not introduce document-level horizontal overflow.

**Toasts and load errors:**

- Convert initial fetch errors that currently appear as bottom-right toasts into inline status banners.
- Keep action toasts for save, delete, status update, upload, and retry outcomes.
- Verify that any remaining toast does not cover page headings, primary actions, or table controls at `1920x1080` and the mobile regression viewport.

**Mobile shell:**

- Reduce unnecessary vertical stacking in the Admin header and navigation at narrow widths.
- Keep all primary actions reachable before the first long data table.
- Preserve the desktop sidebar hierarchy while allowing mobile controls to remain readable and keyboard accessible.

### 4. Add Product contract alignment and accessibility

**Add Product contract:**

The client must align its required markers and client-side validation with `server/src/products/products.validator.ts` and the documented `productCreateSchema`:

- Required: `name`, `category`, `brand`, `price`, `inventory`.
- Optional: `description`, image/image URL, specifications, SKU, manufacturer part number, warranty, and attributes according to the existing server schema.

Add `required`, `min`, and appropriate numeric `step` attributes to the actual required controls. Add a submit-time validation path that prevents `FormData` creation when a required value is invalid and focuses the first invalid field. The server remains responsible for authoritative validation.

**Accessibility:**

- Prefer `NavLink` semantics for sidebar navigation, or add equivalent navigation semantics and `aria-current="page"` if the existing button pattern must remain.
- Notification filters use `role="tablist"`, `role="tab"`, and `aria-selected` consistently.
- The notification popover has a labelled dialog, supports Escape to close, and returns focus to its trigger after close.
- Required indicators are associated with labels and are not used for optional fields.

## Data and API contract policy

- Preserve existing route paths and response keys.
- Do not change public product listing behavior; the product catalog endpoint is intentionally public.
- Use the existing `client/src/features/admin/api.ts` functions unless a response mismatch is proven.
- Do not silently convert `401`, `403`, `4xx`, or `5xx` responses into `[]`, `0`, or “no activity”.
- No Admin alert read API is currently present. The header may use session-local viewed state only if it is labelled as such; it must not imply durable read persistence.

## Acceptance criteria

### Auth and routing

- Direct unauthenticated navigation to every `/admin/*` route never renders the Admin shell before redirecting.
- The login form returns an Admin to the original internal Admin route after successful authentication.
- A Customer cannot render any Admin page and reaches `/403`.
- An Admin can render all eight Admin routes.

### State truthfulness

- Forced request failures show an inline retryable error and do not show a valid-looking empty table or zero KPI.
- Forced empty successful responses show the intended empty state.
- Dashboard partial failure identifies which section is unavailable and does not label the snapshot fully updated.

### UX and accessibility

- Header search copy describes section navigation.
- No ReactPaginate warning occurs for empty result sets.
- Add Product prevents submission of missing actual required fields and permits optional description/image omission.
- Toolbar controls remain usable without clipping at desktop and mobile sizes.
- Table scroll affordance is visible and the document itself has no horizontal overflow.
- Sidebar active state and notification tab state are available to assistive technology.

### Browser verification

Playwright CLI is required for the browser gate. Use the existing CLI-first workflow and capture artifacts under `output/playwright/`.

- Primary desktop pass: viewport exactly `1920x1080`.
- Mobile regression pass: viewport `390x844`.
- Capture screenshots for Dashboard, Products, Orders, Notifications, Add Product, and at least one empty/error state.
- Re-snapshot after every navigation or significant interaction.
- Verify computed document width, visible primary actions, toast/banner overlap, route redirects, and console errors relevant to the Admin flow.
- Authenticated mutation checks require an authorized test account; do not reuse credentials discovered in source without explicit authorization.

## Verification commands

Run from the repository using the exact local runtime already configured for the project:

```powershell
client\node_modules\.bin\tsc.cmd -p client\tsconfig.json --noEmit
client\node_modules\.bin\eslint.cmd client/src --ext .js,.mjs,.cjs,.ts,.mts,.cts,.jsx,.tsx --format=pretty
cd client
.\node_modules\.bin\vitest.cmd run
cd ..
corepack.cmd pnpm --dir client build
```

If a command is blocked by the Windows `node_modules` file lock or network restrictions, report the exact failure and use the direct local binary where it is equivalent.

## Delivery order

1. Implement and test the Admin route boundary.
2. Implement shared status UI and migrate page load failures.
3. Fix dashboard partial-failure semantics.
4. Align forms, pagination, search copy, toolbar layout, and table affordances.
5. Apply accessibility and mobile-shell polish.
6. Run static checks and Playwright at `1920x1080`, then the mobile regression pass.
7. Re-review the diff for authorization, response-contract, and unrelated-change regressions.

No implementation, deployment, merge, or push is authorized by this design document alone.
