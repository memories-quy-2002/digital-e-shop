# Architecture

Digital-E is a pnpm workspace with a React client and an Express API backed by
MySQL.

## Workspace Layout

```text
digital-e-shop/
  client/    React, Vite, TypeScript, SCSS
  server/    Express API, services, models, routes
  docs/      Project documentation
```

## Frontend

The client is organized around page components, layout components, context
providers, API helpers, and SCSS modules.

Key areas:

- `client/src/components/layout`: shared header, footer, and layout pieces.
- `client/src/components/pages`: storefront, customer, and admin pages.
- `client/src/context`: auth, cart, toast, and shared client state.
- `client/src/routes`: app route definitions.
- `client/src/styles`: page and layout styles.

The client communicates with the API through Axios helpers and cookie-based
auth. Unsafe requests must use the existing CSRF token flow.

## Backend

The backend follows a route-controller-service-model split.

```text
server/src/routes       HTTP route definitions
server/src/controllers  Request and response handling
server/src/services     Business rules and orchestration
server/src/models       MySQL queries and table-specific persistence
server/src/middlewares  Auth, CSRF, rate limit, logging, and errors
```

Keep controllers thin. Put validation and business behavior in services. Keep
SQL and schema-specific logic inside models.

## Data Notes

- Promotions are stored in `discounts`.
- Cart data is stored in `carts`.
- Product rating and review totals are derived from `reviews`.
- Order timeline, inventory movement, customer notification, and address book
  tables are created defensively by their backend models when first used.

## Main Request Flow

```text
React page
  -> Axios API helper
  -> Express route
  -> Controller
  -> Service
  -> Model
  -> MySQL
```

For admin routes, role checks should happen before the controller calls the
service layer.

## Operational Areas

- Storefront: product discovery, cart, checkout, wishlist, reviews, order
  history, tracking, notifications, and address book.
- Admin: dashboard analytics, products, inventory movement, orders, accounts,
  promotions, notifications, and exports.
- Performance: read-only k6 scripts for public, customer, and admin browsing
  paths.
