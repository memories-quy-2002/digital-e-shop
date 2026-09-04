# Product Brief — Digital-E

A living, lightweight brief. Update as direction changes.

## Product

Digital-E is a full-stack e-commerce platform for **electronic components and devices**. It serves customers (storefront) and store operators (admin dashboard).

## Target users

- **Customers** — browse the catalog, search/filter, manage cart and wishlist, check out, track orders, manage account/addresses, read notifications.
- **Admins / operators** — manage products, orders, accounts, promotions, inventory, and view analytics.

## Value proposition

A focused storefront for electronics with operational admin tooling (inventory movement tracking, promotions, order timelines, analytics) in one workspace.

## Current scope (high level)

- Storefront: catalog, search/filter/pagination, reviews/ratings, cart, checkout + coupons, wishlist, reorder, order history with timeline, address book, notifications.
- Admin: dashboard analytics, product management (incl. CSV export, soft delete, inventory), order management, account management, promotions, notifications.
- Backend: cookie-based JWT auth, CSRF protection, RBAC, read/write APIs across the above.

## Constraints

- pnpm workspace; **pnpm only**.
- Preserve existing API contracts, auth/CSRF/CORS, and route aliases.
- MySQL is primary persistence; Prisma is partial (see [Wiki ADR 0001](../../Wiki/decisions/0001-mysql-primary-prisma-partial.md)).
- Small-team / solo maintainability — avoid heavy process and unnecessary dependencies.

## Out of scope (for now)

- Full Prisma migration.
- Replacing the cookie-based auth model.

## Open questions

- (Track unresolved product questions here.)
