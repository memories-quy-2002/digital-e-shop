# Admin Dashboard Operations Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Recompose the Digital-E Admin Dashboard into an operations-first control surface with a compact header, live attention queue, four non-duplicated KPIs, range-aware analytics, action-oriented tables, explicit async states, and verified desktop responsiveness.

**Architecture:** Keep the existing React/Vite route, Admin shell, BEM/SCSS surface, Recharts visualizations, and Promise.allSettled request strategy. Add a small typed analytics-range resolver on the Nest backend, a typed client range/alert selector layer, and focused Dashboard components for the header, attention queue, KPI grid, and operations tables. The analytics API change is additive and preserves existing response keys.

**Tech Stack:** React 19, React Router DOM 7, TypeScript, Vite, shadcn source primitives (Card, Button, Badge, Skeleton), Recharts, SCSS, NestJS, Zod, MySQL, Vitest, Testing Library, and Playwright CLI.

## Global Constraints

- Primary browser verification viewports are exactly 1920x1080 and 1280x720; retain the existing 390x844 mobile regression check.
- Keep the Admin route, authorization guards, cookie flow, CSRF behavior, and existing response keys unchanged except for the additive analytics range query parameter and optional response metadata.
- Use pnpm only with the independent client/ and server/ packages; do not add npm or yarn lockfiles.
- Do not add React Query, SWR, a data-grid package, a chart package, or another runtime dependency in this pass.
- Use existing shadcn components and semantic tokens; do not apply a broad preset or rewrite the Admin surface from SCSS to Tailwind.
- Keep independent requests parallel, preserve successful data during refresh, and never represent a rejected request as 0, [], or a successful empty state.
- Use visible labels, keyboard focus, live-region status, text plus color for business states, and 44px minimum interactive targets.
- Do not use git reset --hard, git checkout --, broad staging, or a new worktree.
- The worktree contains pre-existing uncommitted Admin remediation and an unrelated untracked admin-ui-ux-codex-prompt.md; inspect and preserve both. Do not create implementation commits automatically; use exact-path checks and leave source changes available for the user’s requested commit workflow.

## File map

### Backend

- Create server/src/analytics/analytics-range.ts for supported range keys and normalized day counts.
- Create server/src/analytics/__tests__/analytics-range.test.ts for range parsing and fallback behavior.
- Modify server/src/analytics/analytics.validator.ts to validate and normalize range.
- Modify server/src/analytics/analytics.service.ts to use the resolved range for comparison periods and trend windows while preserving response keys.
- Modify Wiki/architecture.md, Wiki/index.md, and Wiki/log.md to document the additive analytics range contract.

### Client data and selectors

- Create client/src/features/admin/utils/dashboardRange.ts and dashboardRange.test.ts.
- Create client/src/features/admin/utils/dashboardAlerts.ts and dashboardAlerts.test.ts.
- Create client/src/features/admin/api.dashboard.test.ts.
- Modify client/src/features/admin/api.ts and client/src/features/admin/utils/dashboardAvailability.ts with their existing tests.

### Client Dashboard UI

- Create AdminDashboardHeader.tsx and its focused test.
- Create AdminDashboardAttention.tsx and its focused test.
- Create AdminDashboardKpiGrid.tsx and its focused test.
- Create AdminDashboardOperations.tsx and its focused test.
- Modify AdminDashboard.tsx, AdminDashboardCharts.tsx, and AdminDashboard.test.tsx.
- Modify client/src/styles/features/admin/_dashboard.scss for the compact operational layout.

### Verification

- Use existing client and server package scripts; add no CI or root orchestration.
- Use Playwright CLI artifacts under output/playwright/admin-remediation/ with fresh Dashboard screenshots for both desktop viewports.

---

### Task 1: Add the validated analytics range contract

**Files:**

- Create: server/src/analytics/analytics-range.ts
- Create: server/src/analytics/__tests__/analytics-range.test.ts
- Modify: server/src/analytics/analytics.validator.ts
- Modify: server/src/analytics/analytics.service.ts

**Interfaces:**

- Produces AnalyticsRangeKey = '7d' | '30d' | '90d'.
- Produces AnalyticsRange = { key: AnalyticsRangeKey; days: 7 | 30 | 90 }.
- Produces resolveAnalyticsRange(rawQuery: unknown): AnalyticsRange.
- Keeps NestAnalyticsService.getAnalyticsSummary(rawQuery) as the controller-facing method.

- [ ] Step 1: Write the failing range resolver test.

Create server/src/analytics/__tests__/analytics-range.test.ts:

~~~ts
import { describe, expect, it } from "vitest";
import { resolveAnalyticsRange } from "../analytics-range";

describe("analytics range resolver", () => {
    it("maps supported query values to day counts", () => {
        expect(resolveAnalyticsRange({ range: "7d" })).toEqual({ key: "7d", days: 7 });
        expect(resolveAnalyticsRange({ range: "30d" })).toEqual({ key: "30d", days: 30 });
        expect(resolveAnalyticsRange({ range: "90d" })).toEqual({ key: "90d", days: 90 });
    });

    it("uses the default range for missing or invalid values", () => {
        expect(resolveAnalyticsRange({})).toEqual({ key: "30d", days: 30 });
        expect(resolveAnalyticsRange({ range: "365d" })).toEqual({ key: "30d", days: 30 });
        expect(resolveAnalyticsRange(null)).toEqual({ key: "30d", days: 30 });
    });
});
~~~

- [ ] Step 2: Run the focused test and confirm the missing-module failure.

Run:

~~~powershell
pnpm --dir server exec vitest run src/analytics/__tests__/analytics-range.test.ts
~~~

Expected: FAIL because analytics-range.ts does not exist yet.

- [ ] Step 3: Implement the range resolver and schema.

Create server/src/analytics/analytics-range.ts:

~~~ts
import { z } from "zod";

export const ANALYTICS_RANGE_KEYS = ["7d", "30d", "90d"] as const;
export type AnalyticsRangeKey = (typeof ANALYTICS_RANGE_KEYS)[number];
export type AnalyticsRange = { key: AnalyticsRangeKey; days: 7 | 30 | 90 };

export const DEFAULT_ANALYTICS_RANGE: AnalyticsRangeKey = "30d";

const DAYS_BY_RANGE: Record<AnalyticsRangeKey, AnalyticsRange["days"]> = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
};

export const analyticsRangeSchema = z.preprocess(
    (value) => (typeof value === "string" ? value : DEFAULT_ANALYTICS_RANGE),
    z.enum(ANALYTICS_RANGE_KEYS).catch(DEFAULT_ANALYTICS_RANGE),
);

export function resolveAnalyticsRange(rawQuery: unknown): AnalyticsRange {
    const query = rawQuery && typeof rawQuery === "object" ? rawQuery : {};
    const key = analyticsRangeSchema.parse((query as { range?: unknown }).range);
    return { key, days: DAYS_BY_RANGE[key] };
}
~~~

Update server/src/analytics/analytics.validator.ts:

~~~ts
import { z } from "zod";
import { analyticsRangeSchema } from "./analytics-range";

export const analyticsSummaryQuerySchema = z.object({
    range: analyticsRangeSchema,
}).passthrough();
~~~

- [ ] Step 4: Thread the range into analytics service queries.

In server/src/analytics/analytics.service.ts:

1. Import resolveAnalyticsRange and remove fixed TREND_DAYS and COMPARISON_DAYS constants.
2. Change mapRevenueTrend(rows) to mapRevenueTrend(rows, trendDays) and pass range.days to buildTrendWindow.
3. At the start of getAnalyticsSummary, resolve the query:

~~~ts
const range = resolveAnalyticsRange(rawQuery);
const comparisonDays = range.days;
~~~

4. Replace the overview interval parameters with:
   [comparisonDays, comparisonDays, comparisonDays, comparisonDays * 2, comparisonDays, comparisonDays * 2, LOW_STOCK_THRESHOLD].
5. Replace the revenue trend parameter with [range.days - 1] and call mapRevenueTrend(revenueTrendRows, range.days).
6. Add the selected-period predicate 'AND o.date_added >= UTC_DATE() - INTERVAL ? DAY' to the category and promotion-performance queries, and add 'AND date_added >= UTC_DATE() - INTERVAL ? DAY' to the payment and discount-order queries that do not use an orders alias. Use range.days as the final parameter for each query. Keep inventory risk, customer segments, and promotion configuration current/live.
7. Return this windows block without renaming any existing response keys:

~~~ts
windows: {
    range: range.key,
    trendDays: range.days,
    comparisonDays: range.days,
},
~~~

- [ ] Step 5: Run backend focused checks.

Run:

~~~powershell
pnpm --dir server exec vitest run src/analytics/__tests__/analytics-range.test.ts
pnpm --dir server typecheck
pnpm --dir server build
~~~

Expected: focused tests pass; typecheck and build exit with code 0.

- [ ] Step 6: Record the additive contract in the Wiki.

Add this note near the analytics/admin-alerts notes in Wiki/architecture.md:

~~~md
- Admin analytics accepts GET /api/analytics/summary?range=7d|30d|90d; the range changes selected-period comparison and trend data while inventory, customer-segment, and catalog configuration signals remain current-state data.
~~~

Set Wiki/index.md Last updated to 2026-09-09 and append this line to Wiki/log.md:

~~~md
- 2026-09-09 - Codex - Added the additive Admin analytics range contract for the operations-first Dashboard.
~~~

- [ ] Step 7: Verify only intended backend/docs paths are dirty.

Run:

~~~powershell
git diff --check -- server/src/analytics Wiki/architecture.md Wiki/index.md Wiki/log.md
git status --short
~~~

Expected: no whitespace errors; pre-existing client modifications and unrelated untracked files remain untouched.

### Task 2: Add typed client range state, alert grouping, and request coverage

**Files:**

- Create client/src/features/admin/utils/dashboardRange.ts
- Create client/src/features/admin/utils/dashboardRange.test.ts
- Create client/src/features/admin/utils/dashboardAlerts.ts
- Create client/src/features/admin/utils/dashboardAlerts.test.ts
- Create client/src/features/admin/api.dashboard.test.ts
- Modify client/src/features/admin/api.ts
- Modify client/src/features/admin/utils/dashboardAvailability.ts and its test

**Interfaces:**

- Produces DashboardRange = '7d' | '30d' | '90d'.
- Produces parseDashboardRange(value: string | null | undefined): DashboardRange.
- Produces getDashboardRangeLabel(range: DashboardRange): string.
- Produces groupAdminAlerts(alerts: AdminAlert[], limit?: number): DashboardAlertGroup[].
- Changes fetchAnalyticsSummary(range?: DashboardRange): Promise<any> without changing default behavior.
- Extends DashboardAvailability with alerts.

- [ ] Step 1: Write dashboardRange.test.ts for supported values, default fallback, and labels Last 7 days, Last 30 days, Last 90 days.

- [ ] Step 2: Implement client/src/features/admin/utils/dashboardRange.ts:

~~~ts
export const DASHBOARD_RANGES = ["7d", "30d", "90d"] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];
export const DEFAULT_DASHBOARD_RANGE: DashboardRange = "30d";

export function parseDashboardRange(value: string | null | undefined): DashboardRange {
    return DASHBOARD_RANGES.includes(value as DashboardRange)
        ? (value as DashboardRange)
        : DEFAULT_DASHBOARD_RANGE;
}

export function getDashboardRangeLabel(range: DashboardRange): string {
    return range === "7d" ? "Last 7 days" : range === "90d" ? "Last 90 days" : "Last 30 days";
}
~~~

- [ ] Step 3: Write dashboardAlerts.test.ts with high-priority ordering, same-type grouping, a four-group limit, and an empty array case.

Use AdminAlert fixtures with type values order, payment, inventory, support, and customer; assert that a High priority group precedes Medium and that two order alerts produce count 2.

- [ ] Step 4: Implement deterministic alert grouping in dashboardAlerts.ts.

Use this exact output shape:

~~~ts
export type DashboardAlertGroup = {
    type: AdminAlert["type"];
    count: number;
    priority: AdminAlert["priority"];
    title: string;
    description: string;
    actionLabel: string;
    route: string;
};
~~~

Sort by priority weight High=3, Medium=2, Low=1, then by createdAt descending. Create one group per type from the first alert in that type, increment count for later alerts, and return the first four groups.

- [ ] Step 5: Update the client API and availability types.

Change fetchAnalyticsSummary in client/src/features/admin/api.ts to:

~~~ts
import type { DashboardRange } from "./utils/dashboardRange";

export async function fetchAnalyticsSummary(range: DashboardRange = "30d"): Promise<any> {
    const response = await http.get("/api/analytics/summary", { params: { range } });
    return response.data;
}
~~~

Extend DashboardSectionKey with alerts, add alerts: "loading" to initialDashboardAvailability, and keep getDashboardUpdateLabel based on all section statuses. Update the existing availability test fixture with alerts: "success".

- [ ] Step 6: Add API request coverage and run client utility tests.

In api.dashboard.test.ts, mock ../../lib/http, call fetchAnalyticsSummary("7d"), and assert:

~~~ts
expect(http.get).toHaveBeenCalledWith("/api/analytics/summary", { params: { range: "7d" } });
~~~

Run:

~~~powershell
pnpm --dir client exec vitest run src/features/admin/utils/dashboardRange.test.ts src/features/admin/utils/dashboardAlerts.test.ts src/features/admin/api.dashboard.test.ts src/features/admin/utils/dashboardAvailability.test.ts
~~~

Expected: all focused tests pass.

### Task 3: Build the header, attention queue, and KPI primitives

**Files:**

- Create client/src/features/admin/components/AdminDashboardHeader.tsx and its test.
- Create client/src/features/admin/components/AdminDashboardAttention.tsx and its test.
- Create client/src/features/admin/components/AdminDashboardKpiGrid.tsx and its test.
- Reuse client/src/components/ui/card.tsx, button.tsx, badge.tsx, skeleton.tsx, and AdminStatusPanel.tsx.

**Interfaces:**

- AdminDashboardHeaderProps consumes range, onRangeChange, loading, updateLabel, lastUpdated, onRefresh, and onDownloadReport.
- AdminDashboardAttentionProps consumes status, groups, and onRetry.
- AdminDashboardKpiGridProps consumes four KPI records with label, value, description, status, optional delta, and optional href.

- [ ] Step 1: Read installed shadcn component docs before composing them.

Run:

~~~powershell
pnpm --dir client dlx shadcn@latest docs card button badge skeleton
~~~

Expected: the CLI returns documentation URLs without modifying components.json or source files. Do not run init, apply, or add.

- [ ] Step 2: Write focused component tests.

Cover these behaviors:

~~~ts
it("renders a labelled range selector and both actions", () => {
    render(<AdminDashboardHeader {...props} />);
    expect(screen.getByLabelText("Analytics range")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download report" })).toBeTruthy();
});

it("renders an empty attention state after a successful empty response", () => {
    render(<AdminDashboardAttention status="success" groups={[]} onRetry={vi.fn()} />);
    expect(screen.getByText("No active operational alerts")).toBeTruthy();
});

it("renders exactly four primary KPI articles", () => {
    render(<AdminDashboardKpiGrid kpis={kpis} />);
    expect(screen.getAllByRole("article")).toHaveLength(4);
    expect(screen.queryByText("Top product")).toBeNull();
});
~~~

- [ ] Step 3: Implement AdminDashboardHeader.tsx with one h1, a visible label Analytics range, a native select with 7d/30d/90d, a polite live status, an outline Refresh button, and a primary Download report button. The selector calls onRangeChange; Refresh is disabled while loading; both buttons use type="button".

- [ ] Step 4: Implement AdminDashboardAttention.tsx with role="region" and aria-label="Needs attention". Use AdminStatusPanel for loading, error, and successful empty states. For groups, render an article with count, visible priority text, description, and a Link using the group route and actionLabel. Never use priority color without a text label.

- [ ] Step 5: Implement AdminDashboardKpiGrid.tsx with shadcn Card, CardHeader, CardTitle, CardDescription, and CardContent. Render only Net revenue, Orders, Pending orders, and Low stock. Use tabular numerals and Badge text such as +12.4% vs previous period. Render Unavailable when status is error; do not coerce errors to zero.

- [ ] Step 6: Run focused component tests.

Run:

~~~powershell
pnpm --dir client exec vitest run src/features/admin/components/AdminDashboardHeader.test.tsx src/features/admin/components/AdminDashboardAttention.test.tsx src/features/admin/components/AdminDashboardKpiGrid.test.tsx
~~~

Expected: all focused tests pass.

### Task 4: Rewire Dashboard data and URL state

**Files:**

- Modify client/src/features/admin/pages/AdminDashboard.tsx.
- Modify client/src/features/admin/pages/AdminDashboard.test.tsx.
- Modify client/src/features/admin/utils/dashboardAvailability.ts.
- Modify client/src/features/admin/api.ts.

**Interfaces:**

- AdminDashboard owns DashboardRange from useSearchParams.
- fetchDashboardData(showToast?: boolean) requests analytics with the selected range and fetchAdminAlerts in the same Promise.allSettled batch.
- Existing dashboardStats remains the source for live pending orders, current activity, and fallback inventory rows.

- [ ] Step 1: Add URL range coverage to the Dashboard test harness.

Render the Dashboard under a MemoryRouter at /admin?range=7d. Assert that the selector displays Last 7 days, changing it to Last 90 days calls fetchAnalyticsSummary("90d"), and the URL becomes /admin?range=90d.

- [ ] Step 2: Add alert mocks and partial-failure coverage.

Mock fetchAdminAlerts with a successful payload and a rejected payload. Assert that analytics remains visible when alerts fail, the attention section shows a retryable error, and the global update label is Partially updated.

- [ ] Step 3: Add range and alert state to AdminDashboard.

Use:

~~~tsx
const [searchParams, setSearchParams] = useSearchParams();
const range = parseDashboardRange(searchParams.get("range"));
const [alerts, setAlerts] = useState<AdminAlert[]>([]);
~~~

Use setSearchParams({ range: nextRange }, { replace: true }) in the range handler. Add fetchAdminAlerts to the existing parallel load:

~~~tsx
const [analyticsResult, productResult, orderResult, userResult, orderItemResult, alertsResult] = await Promise.allSettled([
    fetchAnalyticsSummary(range),
    fetchAdminProducts(1, 60),
    fetchAdminOrders(1, 80),
    fetchAdminUsers(1, 80),
    fetchOrderItems(1, 120),
    fetchAdminAlerts(),
]);
~~~

Set alerts only when the alert request fulfills, set its availability independently, count all six sections for refresh status, and preserve successful data during a later failed refresh.

- [ ] Step 4: Replace the duplicate markup order.

Render:

~~~tsx
<AdminDashboardHeader ... />
<AdminDashboardAttention status={availability.alerts} groups={alertGroups} onRetry={() => fetchDashboardData(true)} />
<AdminDashboardKpiGrid kpis={primaryKpis} />
<AdminDashboardCharts ... />
~~~

Remove the six-card admin__dashboard__summary section and the four-card local Card metric section. Keep report download behavior, but label range-derived values with the selected range rather than this month.

- [ ] Step 5: Keep derived values memoized and truthful.

Use useMemo for alertGroups, primaryKpis, and chart data. The selected range is a primitive dependency. Do not define components inside AdminDashboard, do not add a new context, and do not read alert state from localStorage.

- [ ] Step 6: Run Dashboard unit tests.

Run:

~~~powershell
pnpm --dir client exec vitest run src/features/admin/pages/AdminDashboard.test.tsx
~~~

Expected: all Dashboard state, report, range, and partial-failure tests pass.

### Task 5: Add action-first operations tables and demote secondary analytics

**Files:**

- Create client/src/features/admin/components/AdminDashboardOperations.tsx and its test.
- Modify client/src/features/admin/components/AdminDashboardCharts.tsx.

**Interfaces:**

- AdminDashboardOperationsProps consumes pendingOrders, lowStockProducts, ordersStatus, productsStatus, formatCurrency, and formatReportDate.
- The component renders Orders needing action and Inventory risk without making API requests.
- AdminDashboardCharts continues to consume existing chart arrays and receives rangeLabel for time-based card descriptions.

- [ ] Step 1: Write operations-table tests.

Cover:

~~~ts
it("renders pending orders with a clear queue action", () => {
    render(<AdminDashboardOperations pendingOrders={[pendingOrder]} lowStockProducts={[]} ordersStatus="success" productsStatus="success" {...formatters} />);
    expect(screen.getByRole("heading", { name: "Orders needing action" })).toBeTruthy();
    expect(screen.getByText("#42")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open orders" })).toHaveAttribute("href", "/admin/orders");
});

it("renders successful empty states", () => {
    render(<AdminDashboardOperations pendingOrders={[]} lowStockProducts={[]} ordersStatus="success" productsStatus="success" {...formatters} />);
    expect(screen.getByText("No pending orders")).toBeTruthy();
    expect(screen.getByText("No low-stock products")).toBeTruthy();
});
~~~

- [ ] Step 2: Implement the operation tables.

Use two cards in an accessible labelled section. Orders columns are Order, Customer, Value, Age, Payment, Action. Inventory columns are Product, Stock, Severity, Action. Wrap tables with AdminTableScrollHint, use responsive={false}, add View all links, limit to five rows, and render Guest checkout/Not recorded for missing fields. Render AdminStatusPanel for loading/error rather than a misleading table.

- [ ] Step 3: Reorder AdminDashboardCharts.

Render AdminDashboardOperations before Executive analytics, monthly charts, payment mix, category revenue, promotion performance, and best-selling details. Keep Order pipeline beside the primary trend, remove duplicate pending KPI insight cards, and label time-based cards with rangeLabel.

- [ ] Step 4: Demote secondary analytics.

Wrap payment mix, category revenue, promotion performance, recent activity, customer segments, and best-selling content in admin__dashboard__secondary. Stack it after action tables on narrow screens without hiding data required for the operational queue.

- [ ] Step 5: Run operations and chart tests.

Run:

~~~powershell
pnpm --dir client exec vitest run src/features/admin/components/AdminDashboardOperations.test.tsx src/features/admin/pages/AdminDashboard.test.tsx
~~~

Expected: all focused tests pass.

### Task 6: Apply dense, accessible Dashboard styling with restrained shadcn polish

**Files:**

- Modify client/src/styles/features/admin/_dashboard.scss.
- Modify client/src/styles/features/admin/_shell.scss only when a shared override must win after imported route styles.

**Interfaces:**

- New classes are admin__dashboard__header, admin__dashboard__attention, admin__dashboard__kpis, admin__dashboard__operations, and admin__dashboard__secondary with BEM children.

- [ ] Step 1: Add compact header and attention styles.

Use existing --de-color-* and --de-radius-* tokens. The header is compact with a thin signal border, not a large gradient hero. Attention cards use priority borders and visible labels. Use explicit transitions for background-color, border-color, color, and box-shadow; do not use transition: all.

- [ ] Step 2: Add dense KPI and operations grids.

Use four equal KPI columns at 1920x1080, two columns at 1280x720 when content width requires it, and one column on narrow screens. Give the operations table a wider primary column and inventory a compact column. Right-align numeric columns and use font-variant-numeric: tabular-nums.

- [ ] Step 3: Add table overflow and focus affordances.

Keep each table inside AdminTableScrollHint. Show Swipe horizontally to view more columns below the dashboard breakpoint, preserve keyboard focus on the region, and keep document scrollWidth equal to available width after accounting for the vertical scrollbar.

- [ ] Step 4: Add responsive header controls.

At 1280x720 keep title, range, freshness, Refresh, and Download report readable without a tall hero. Below 720px stack controls full-width and keep every button at least 44px high.

- [ ] Step 5: Add reduced-motion and loading styling.

Use reserved skeleton heights matching the header, attention cards, KPI cards, and operations cards. Under prefers-reduced-motion, disable nonessential transitions and animations. Do not add reveal animation to data cards.

- [ ] Step 6: Review shadcn composition.

Confirm new cards use CardHeader/CardTitle/CardDescription/CardContent, new action buttons use type="button", badges carry text, and new JSX does not introduce raw color utilities. Keep legacy tables only as the renderer inside labelled scroll regions.

### Task 7: Add final tests, static verification, and Playwright evidence

**Files:**

- Modify the focused client and server tests from Tasks 1–5.
- Create screenshots under output/playwright/admin-remediation/.

- [ ] Step 1: Run complete client checks.

Run:

~~~powershell
pnpm --dir client exec tsc -p tsconfig.json --noEmit
pnpm --dir client exec eslint src --ext .js,.mjs,.cjs,.ts,.mts,.cts,.jsx,.tsx --format stylish
pnpm --dir client build
pnpm --dir client exec vitest run --reporter=dot
~~~

Expected: typecheck, build, and all tests exit 0; ESLint has 0 errors. Existing any warnings may remain and must be reported separately.

- [ ] Step 2: Run complete server checks.

Run:

~~~powershell
pnpm --dir server typecheck
pnpm --dir server build
pnpm --dir server lint
~~~

Expected: all three commands exit 0. Do not run database reset/seed commands for this change.

- [ ] Step 3: Run Playwright at 1920x1080.

Using the existing admin-ui session:

~~~powershell
npx.cmd --yes --package @playwright/cli playwright-cli --session admin-ui resize 1920 1080
npx.cmd --yes --package @playwright/cli playwright-cli --session admin-ui goto http://localhost:5173/admin
npx.cmd --yes --package @playwright/cli playwright-cli --session admin-ui screenshot --filename output/playwright/admin-remediation/dashboard-operations-1920x1080.png
~~~

Verify the first viewport contains the compact header, range control, attention queue, four KPIs, and the beginning of operations. Exercise Last 7 days, Refresh, an alert CTA, and a table region. Capture a fresh screenshot after each significant interaction.

- [ ] Step 4: Run Playwright at 1280x720.

~~~powershell
npx.cmd --yes --package @playwright/cli playwright-cli --session admin-ui resize 1280 720
npx.cmd --yes --package @playwright/cli playwright-cli --session admin-ui goto http://localhost:5173/admin
npx.cmd --yes --package @playwright/cli playwright-cli --session admin-ui screenshot --filename output/playwright/admin-remediation/dashboard-operations-1280x720.png
~~~

Verify controls remain readable, KPI cards do not duplicate, operation tables are usable, and there is no document-level horizontal overflow.

- [ ] Step 5: Run the existing mobile regression.

Resize to 390x844, verify stacked controls, actionable attention cards, table-local horizontal scrolling, and no document-level horizontal overflow. Capture dashboard-operations-390x844.png.

- [ ] Step 6: Review final scope.

Run:

~~~powershell
git diff --check
git status --short
git diff --stat -- client/src/features/admin client/src/styles/features/admin server/src/analytics Wiki
~~~

Review for authorization/CSRF changes, accidental dependency or lockfile changes, raw secrets, broad staging, new transition: all, fake zero states, and claims that conflate API failures with visual behavior. Leave implementation files uncommitted unless the user separately requests a commit.
