# Product Brief — Digital-E

A living, lightweight brief. Update as direction changes.

## Product

Digital-E is a full-stack e-commerce platform for **electronic components and devices**. It serves customers (storefront) and store operators (admin dashboard).

## Target users

- **Customers** — browse the catalog, search/filter, manage cart and wishlist, check out, track orders, manage account/addresses, read notifications.
- **Guest shoppers** — keep a browser-local cart, preview authoritative totals, and complete token-protected checkout without an account.
- **Admins / operators** — manage products, orders, accounts, promotions, inventory, and view analytics.

## Value proposition

A focused storefront for electronics with operational admin tooling (inventory movement tracking, promotions, order timelines, analytics) across independent client and server packages.

## Current scope (high level)

- Storefront: catalog, search/filter/pagination, reviews/ratings, guest or authenticated cart, checkout + coupons, wishlist, reorder, order history with timeline, address book, notifications, and support tickets.
- Admin: dashboard analytics with range-aware trends, product management (including CSV export, soft delete, inventory), order management, account management, promotions, notifications, operational alerts, and demo-data verification.
- Backend: cookie-based JWT sessions, Firebase verification in production, CSRF protection, role/ownership guards, payment ledger, inventory reservations/movements, and read/write APIs across the above.

## Constraints

- Independent pnpm packages in `client/` and `server/`; **pnpm only**.
- Preserve existing API contracts, auth/CSRF/CORS, and route aliases.
- MySQL is primary persistence; Prisma is partial (see [Wiki ADR 0001](../../Wiki/decisions/0001-mysql-primary-prisma-partial.md)).
- Client and server are independent package roots; there is no root workspace or supported root `pnpm --filter` workflow.
- Small-team / solo maintainability — avoid heavy process and unnecessary dependencies.

## Out of scope (for now)

- Full Prisma migration.
- Replacing the cookie-based auth model.
- Guest accounts, email-based guest order recovery, or a second persistent guest-cart database.

## Open questions

- (Track unresolved product questions here.)
