# Admin Dashboard Operations Design

**Status:** Design approved by the user; spec review pending.

**Date:** 2026-09-09

## Goal

Make the Admin Dashboard an operations-first control surface. An admin should
be able to answer, in the first viewport:

1. What needs attention now?
2. How are revenue and orders trending for the selected period?
3. Which order or inventory workflow should I open next?

The redesign must improve hierarchy, scanability, density, table usability,
filtering, responsive behavior, loading/empty/error states, and accessibility
without introducing decorative UI that competes with operational data.

## Current findings

- The dashboard renders six summary cards and four metric cards with overlapping
  Sales, Revenue, Products, and Users data.
- The dark hero occupies substantial space while the primary operational queue
  is below the fold.
- Pending orders, inventory risk, and alerts are not grouped into a single
  decision-oriented area.
- Secondary analytics compete visually with action-oriented tables.
- The analytics endpoint currently uses a fixed comparison period and the
  client has no user-selected range.
- The client already has shadcn source components (`Card`, `Button`, `Badge`,
  `Skeleton`) and Recharts. No new runtime package is justified for this pass.

## User-approved direction

Use the Operations-first approach:

- Keep the existing Admin route and overall navigation.
- Replace duplicate KPI presentation with one compact primary KPI grid.
- Promote a live `Needs attention` area above secondary analytics.
- Add a `7 days`, `30 days`, and `90 days` analytics range filter persisted in
  the Dashboard URL.
- Use the existing `/api/admin/alerts` endpoint for current order, payment,
  inventory, support, and customer signals.
- Extend `/api/analytics/summary` additively with a validated `range` query
  parameter. Existing response keys remain compatible.
- Keep Recharts for visualization and lazy-load the chart bundle.
- Use shadcn composition and semantic tokens where primitives are introduced;
  retain the existing BEM/SCSS Admin surface instead of applying a broad
  preset or rewriting the application in Tailwind.
- Use `frontend-design` only for restrained visual polish: a compact technical
  header, a clear signal accent, intentional typography, and minimal motion.

## Non-goals

- Do not migrate the whole Admin UI to a new component library.
- Do not add React Query/SWR or another data-fetching package in this pass.
- Do not introduce a global cross-entity search API.
- Do not change order, inventory, promotion, or account authorization rules.
- Do not make live alerts appear persistently read when the backend has no
  durable read-state endpoint.
- Do not turn every chart into a dashboard widget editor or add drag-and-drop.

## Information architecture

The Dashboard keeps the current route but changes the order and prominence of
content:

```text
[Dashboard + range] [data freshness] [Refresh] [Download report]

[Needs attention: pending orders] [low/out-of-stock] [alerts] [support]

[Net revenue] [Orders] [Pending orders] [Low stock]

[Revenue and orders trend                     ] [Order pipeline]

[Orders needing action table                  ] [Inventory risk]

[Recent activity                              ] [Promotion/customer insights]

[Secondary analytics and best-selling detail]
```

### Header and range

The large marketing-style hero becomes a compact dashboard header. It keeps the
Admin Dashboard title, a short operational description, freshness status,
range selector, Refresh, and Download report. The selected range is stored as
`?range=7d`, `?range=30d`, or `?range=90d` and is safe to share or reload.

The range applies to server-calculated analytics, revenue, orders, and trend
visualizations. Live alerts and current inventory/order action queues are
labelled as live/current rather than being falsely presented as historical
range data.

### Needs attention

Render up to four high-value alert groups from `/api/admin/alerts`, ordered by
priority and recency. Each group shows a count, severity text, a concise reason,
and a direct CTA such as `Open orders`, `Manage product`, or `Open support`.
If there are no alerts, show a compact successful empty state: `No active
operational alerts` with no decorative illustration. If the request fails,
show an inline retryable status and keep unrelated dashboard sections usable.

### Primary KPI grid

Use only four primary cards:

- Net revenue for the selected analytics range, with comparison direction.
- Orders for the selected analytics range, with comparison direction.
- Pending orders requiring action now.
- Low-stock products requiring review now.

Products, users, top product, payment mix, and promotion totals remain available
in lower-priority insight sections or tables. They should not duplicate the
primary KPI row.

### Charts and tables

- The revenue/orders trend is the primary chart and receives the widest area.
- Order pipeline is a compact status distribution with text labels and counts,
  not color alone.
- Orders needing action is a dense table with order ID, customer, value, age,
  payment state, and one primary action.
- Inventory risk is a dense table or compact ranked list with product, stock,
  severity, and `Manage inventory` action.
- Payment mix, category revenue, promotion performance, recent activity, and
  best-selling products are secondary insights below the operational queue.
- Every wide table remains inside an accessible horizontal-scroll region with a
  visible narrow-viewport hint. The document itself must never overflow.

## Component and styling plan

Introduce small dashboard-owned components with one responsibility:

- `DashboardHeader`: title, range control, freshness, primary/secondary actions.
- `DashboardAttentionPanel`: live alerts, empty, loading, error, and retry.
- `DashboardKpiGrid`: four primary KPIs and comparison metadata.
- `DashboardChartCard`: consistent card header, legend, chart status, and
  optional data-table fallback.
- `DashboardOperationsTable`: action-first table composition and overflow
  affordance.
- `DashboardSecondaryInsights`: lower-priority analytics, preferably collapsed
  on narrow screens if the full detail is not needed immediately.

Use existing shadcn `Card`, `Button`, `Badge`, and `Skeleton` primitives where
they fit. Add a shadcn `Table` source component only if the existing legacy
table wrapper cannot support the required semantics; do not add a runtime
dependency for it. Keep class names and styles in the Admin BEM/SCSS surface.

Visual rules:

- Navy/charcoal is reserved for the compact header and navigation.
- Orange signal color is reserved for the primary action and high-priority
  attention states.
- Electric blue supports links and informational data.
- Green, amber, and red must always be paired with labels or icons.
- Use tabular numerals, sentence-case labels, no decorative gradients, no
  oversized display copy, and no hover-only information.
- Use subtle 150–250ms interaction transitions and disable nonessential motion
  under `prefers-reduced-motion`.

## Data flow and API contract

The client keeps independent section statuses and starts independent requests in
parallel. The dashboard data load becomes:

```text
analytics summary(range) ─┐
admin alerts              ├─ Promise.allSettled ── section status map
products                  │
orders                    │
users                     │
order items               ┘
```

The server adds a safe enum-like query contract:

```text
GET /api/analytics/summary?range=7d
GET /api/analytics/summary?range=30d
GET /api/analytics/summary?range=90d
```

Invalid or missing values use the existing default range. The server must
parameterize interval values and preserve existing response keys. The response
may add a normalized `range` and comparison metadata, but consumers must not
depend on a breaking rename.

The client passes the selected range only to the analytics request. Current
alert data remains live and current; the UI labels that distinction explicitly.
No dashboard request converts a rejection into `0`, an empty array, or a
successful empty state.

## Loading, empty, and error behavior

- Initial load: header and each major block has a reserved skeleton shape to
  reduce layout shift.
- Partial success: successful blocks remain visible; failed blocks show the
  affected section, a concise reason, and Retry.
- Refresh: preserve known-good data while refreshing and expose a non-blocking
  freshness state.
- Empty analytics: show a short explanation and the selected range; do not show
  a blank chart or fake zero unless the API explicitly returned a real zero.
- Empty attention queue: show `No active operational alerts` and keep the rest
  of the dashboard actionable.
- Errors use `role="alert"` or an equivalent live region, and recovery actions
  are placed beside the affected section.

## Responsive and accessibility requirements

- Primary verification viewports: exactly `1920×1080` and `1280×720`.
- At `1280×720`, the header, attention queue, and primary KPI grid remain
  scannable without forcing the first operational table below excessive chrome.
- At narrow widths, controls stack, tables scroll inside labelled regions, and
  the page has no document-level horizontal overflow.
- Use one `h1`, sequential section headings, semantic `nav`, labelled range
  controls, visible keyboard focus, and 44px minimum interactive targets.
- Charts include a visible legend or text summary and never communicate a
  business state through color alone.
- Links and buttons state their result: `Open orders`, `Manage inventory`,
  `Refresh`, and `Download report`.
- The attention panel and refresh status use appropriate live-region semantics.

## Performance decisions

- Keep the existing lazy import for the chart-heavy module.
- Keep independent requests parallel; do not introduce request waterfalls.
- Extract stable chart/card sections and memoize only data-heavy pure sections
  when profiling shows repeated renders.
- Avoid a new data library until the Dashboard has a real cache/invalidation
  requirement across multiple routes.
- Keep chart data transformation in memoized selectors and avoid recomputing
  derived arrays in JSX.

## Testing and acceptance criteria

### Functional

- Selecting 7/30/90 days updates the URL and requests the matching analytics
  range.
- Refresh preserves successful data and correctly reports partial failure.
- Alert CTAs route to the corresponding Admin workflow.
- KPI cards do not duplicate the removed summary metrics.
- Orders and inventory tables expose a direct next action.
- Empty and error states provide explicit recovery or next-step guidance.

### Accessibility and responsive

- Keyboard users can reach the range selector, actions, alert CTAs, and table
  links in logical order.
- Error and refresh statuses are announced without relying on color.
- No horizontal document overflow at `1920×1080`, `1280×720`, or the existing
  mobile regression viewport.
- Table scroll regions have meaningful accessible labels and visible narrow-width
  guidance.

### Verification

- Add focused Vitest/Testing Library coverage for range parsing, request
  parameters, alert grouping, KPI composition, and partial/empty/error states.
- Run client typecheck, lint, build, and the full Vitest suite.
- Use Playwright CLI to capture Dashboard screenshots at `1920×1080` and
  `1280×720`, exercise the range selector, refresh state, alert CTA, and table
  overflow behavior.
- Keep API/runtime failures separate from visual claims in the final report.

## Delivery order

1. Add the range contract and typed client helper while preserving defaults.
2. Add focused data selectors and live alert loading with independent statuses.
3. Recompose the Dashboard into the compact header, attention panel, KPI grid,
   operational tables, and secondary insights.
4. Apply shadcn primitives and Admin BEM/SCSS polish without a broad preset
   migration.
5. Add focused tests and run static checks.
6. Verify the final Dashboard with Playwright at both desktop viewports and the
   existing mobile regression viewport.
7. Review the diff for API compatibility, authorization boundaries, visual
   density, and unrelated changes.
