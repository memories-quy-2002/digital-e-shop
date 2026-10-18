# Admin UI/UX review and proposal

Reviewed source: AdminLayout/sidebar/global header, Dashboard header/alerts/KPIs/order and stock queues/lazy charts/activity; Orders, Products/Inventory, Fulfillment, Support, Notifications, After-sales, Payment reconciliation, COD settlements, Promotions, Accounts, Delivery settings, Email operations and Audit log. This is source review; no API, route or permission change is proposed.

## Findings
- The sidebar presents 13 routes under one “Workspace” caption. Group by task to make scanning faster.
- Dashboard already contains alerts, KPIs, actionable queues and analytics. Prioritize attention and work queues before trends and deeper analysis.
- Operational pages mix summaries, filters, tables, detail views and forms with varying hierarchy. Standardize page heading/actions → status summary → filter/result toolbar → queue/table → detail drawer → loading/empty/error feedback.
- Header search recognizes a few keywords and otherwise returns to Dashboard. Improve discoverability and keyboard/focus states; do not imply record-wide search until the API supports it.
- Payment, refund, settlement and promotion changes are consequential. Add clear pending/success/error feedback and explicit confirmation; motion must not create urgency.

## Navigation groups
Overview: Dashboard
Operations: Notifications, Orders, Fulfillment, Support, After-sales
Catalog & growth: Products, Promotions
Finance: Payment reconciliation, COD settlements
Store settings: Delivery settings, Accounts, Email operations, Audit log
Keep existing routes and role checks.

## Dashboard order
1. Heading, date range, freshness, refresh/export.
2. Compact attention strip with counts and direct queue links.
3. Four KPIs with period context and explicit loading/unavailable states.
4. Action queue and orders needing review.
5. Selected-period revenue/order trend.
6. Inventory watch and payment mix.
7. Category/product analysis and recent activity farther down.

## Motion
- Page entrance 160–220ms opacity + 6–8px rise, once.
- Hover/focus 120–160ms color/background/transform.
- Mobile navigation/detail drawer 180–220ms with focus containment and return.
- Refresh spinner and status; retain existing content to prevent layout shift.
- Chart draw/fade once; no looping/count-up delays.
- Honor prefers-reduced-motion; keep keyboard-visible focus and 44px mobile targets.

Preview colors adapt Digital-E warm neutral, graphite, coral, blue, olive and status hues. Figures are illustrative.

## Firecrawl references
- AdminLTE, “Admin Dashboard Design: Principles, Layouts & Examples”: https://adminlte.io/blog/admin-dashboard-design/
- JetAdmin, “Admin Dashboard: How to Choose, Build, and Ship a Production-Ready Admin Panel”: https://www.jetadmin.io/blog/admin-dashboard-how-to-choose-build-and-ship-a-production-ready-admin-panel/

These are external examples, not universal standards; the recommendation is adapted to Digital-E source structure.
