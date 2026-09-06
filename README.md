# Digital-E E-commerce System

Digital-E is a full-stack e-commerce system for electronic products. The project is organized as a pnpm workspace with a React storefront, a NestJS API on an Express-compatible runtime, MySQL persistence, admin operations tools, and read-only k6 performance tests.

## Tech Stack

| Area | Tools |
| --- | --- |
| Frontend | React 19, Vite, TypeScript, SCSS, React Bootstrap |
| Backend | Node.js, NestJS, Express 5 runtime, MySQL, JWT, CSRF protection |
| State and API | React context, Axios, cookie-based sessions |
| Admin tools | Product, order, account, promotion, notification, analytics, and inventory management |
| Production services | Firebase Admin identity verification, Stripe checkout/webhooks, optional Redis-backed rate limiting |
| Testing | TypeScript checks, Vite build, k6 read-only performance tests |
| Package management | pnpm workspace |

## Main Features

### Storefront

- Product catalog with search, filters, pagination, reviews, ratings, and product details.
- Cart, checkout validation, coupon application, wishlist, and reorder flow.
- Customer order history with payment method, totals, items, and tracking timeline.
- Customer notification center for order updates.
- Customer address book with default address support and checkout autofill.
- News, About, Support, Login, Signup, Footer, Home, Shop, and Cart UI improvements.

### Admin Dashboard

- Dashboard analytics for revenue, orders, customers, inventory risk, and promotion performance.
- Product management with edit, soft delete, inventory updates, and CSV export.
- Inventory movement log for stock creation, sales deductions, and manual adjustments.
- Order management with searchable rows, status updates, detail modal, timeline, and CSV export.
- Account management with all-user search, role/status updates, customer profiles, and order counts.
- Promotion management for discount codes, minimum order rules, date ranges, and usage limits.
- Admin notifications center.

### Backend

- Firebase ID tokens are verified by the server before a user can log in or register; the server then issues its own JWT access token and cookie-backed refresh session.
- Rotating and revocable refresh sessions, suspension-aware access checks, and CSRF protection for unsafe requests.
- Role-based access control for customer and admin routes.
- Reservation-backed checkout with Stripe webhook idempotency and transactional promotion redemption quotas.
- Transactional inventory movements, order status timeline events, and audit tables; notifications are emitted after commit.
- Product identity through SKU/MPN, typed structured attributes, and immutable order-item snapshots for historical accuracy.
- Read APIs for analytics, products, orders, reviews, wishlist, notifications, addresses, and inventory movements.
- Write APIs for checkout, cart, wishlist, reviews, products, promotions, addresses, notifications, and order status updates.

## Production hardening and configuration

The server verifies Firebase identity at the backend boundary, then binds short-lived access tokens to an active database session. Refresh tokens are rotated and stored as hashes; logout, revocation, expiry, or user suspension prevents further renewal. Checkout reserves inventory before payment completion, consumes a reservation exactly once during Stripe finalization, and uses the Stripe Checkout Session uniqueness constraint as an idempotency boundary.

Inventory movements, product stock changes, product attributes, order timeline events, and order audit rows are written in the owning transaction. Notifications are dispatched only after the transaction commits. Products expose stable SKU/MPN identity and typed text/number attributes; order items copy product, pricing, warranty, image, and attribute data into immutable snapshots so later catalog edits do not rewrite order history.

Copy [`server/.env.example`](./server/.env.example) for the complete local template. The runtime configuration requires the database and authentication values below; production deployments should provide them through the platform secret manager rather than committed files:

| Variable | Purpose |
| --- | --- |
| `NODE_ENV`, `PORT` | Runtime mode and API port. |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DATABASE_URL` | MySQL connection settings. |
| `JWT_SECRET_KEY`, `JWT_REFRESH_SECRET_KEY`, `CSRF_SECRET` | Access-token, refresh-token, and CSRF signing secrets. |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Firebase Admin server verification credentials. |
| `CLIENT_URL`, `SERVER_URL` | CORS, cookie, and checkout callback origins. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe Checkout and webhook signature verification. |
| `REDIS_URL` | Production shared rate-limit store; without it, the documented middleware falls back to process-local memory. |

Schema changes are forward Prisma migrations under `server/src/database/prisma/migrations/`. Runtime repositories never create tables, alter schema, or discover columns; deploy pending migrations before starting an instance that depends on them. See [`server/README.prisma.md`](./server/README.prisma.md).

## Project Structure

```text
digital-e-shop/
  client/                 React/Vite storefront and admin UI
    src/
      api/                Axios client and request helpers
      components/         Pages, layout, common UI, admin UI
      context/            Auth, cart, toast, and app context
      services/           Firebase and client services
      styles/             SCSS page and layout styles
      utils/              Formatting and shared helpers
  server/                 NestJS API on an Express-compatible runtime
    src/
      config/             Typed environment, CORS, and database config
      core/               Errors, middleware, and response helpers
      database/           Prisma schema, forward migrations, and seeders
      modules/            Feature-owned controllers, services, repositories, and validators
      shared/             Cross-cutting types, helpers, and utilities
    test/                 k6 performance scripts
  pnpm-workspace.yaml     Workspace package definition
  pnpm-lock.yaml          Root lockfile for client and server
```

## Documentation

- [Changelog](./CHANGELOG.md)
- [Contributing Guide](./CONTRIBUTING.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Prisma migration workflow](./server/README.prisma.md)
- [API Guide](./docs/API.md)
- [Development Guide](./docs/DEVELOPMENT.md)
- [Testing Guide](./docs/TESTING.md)

## Prerequisites

- Node.js compatible with the current package set.
- pnpm via Corepack or a global pnpm install.
- MySQL database and a configured `server/.env`.
- k6, only if you want to run performance tests.

## Installation

Install all workspace dependencies from the repository root:

```powershell
pnpm install
```

The root `pnpm-lock.yaml` resolves both `client` and `server`.

## Local Development

Run both apps from the root:

```powershell
pnpm dev
```

Or run each package separately:

```powershell
pnpm --filter server dev
pnpm --filter client start
```

Default local URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`
- Health check: `http://localhost:4000/api/health`

## Useful Scripts

From the root:

```powershell
pnpm dev
pnpm start
```

From `client/`:

```powershell
pnpm start
pnpm build
pnpm test
```

From `server/`:

```powershell
pnpm dev
pnpm start
pnpm seed:mock
pnpm perf:readonly
pnpm perf:admin-readonly
pnpm perf:customer-readonly
```

## Performance Testing

The k6 scripts are designed to avoid database mutations by using read-only endpoints.

Public read-only test:

```powershell
cd server
k6 run test/performance-test.js
```

Admin read-only test:

```powershell
cd server
$env:COOKIE="session=...; accessToken=..."
k6 run test/k6-admin-readonly.js
```

Customer read-only test:

```powershell
cd server
$env:USER_ID="your-user-id"
$env:COOKIE="session=...; accessToken=..."
k6 run test/k6-customer-readonly.js
```

Do not use production data for write-heavy load tests. Checkout, reviews, cart writes, address writes, notification writes, and admin updates should be tested against a cloned test database.

## Verification

Recommended checks before opening a pull request:

```powershell
client\node_modules\.bin\tsc.cmd -p client\tsconfig.json --noEmit
cd client
.\node_modules\.bin\vite.cmd build
```

For backend syntax checks, run targeted Node checks against changed files:

```powershell
cd server
node --check src\app.js
node --check src\routes\userRoutes.js
node --check src\routes\productRoutes.js
```

## Notes

- The backend uses cookie-based auth and CSRF protection. Unsafe requests need the CSRF token flow from the Axios client.
- Promotion data is stored in `discounts`.
- Cart data is stored in `carts`.
- Product ratings and review counts are derived from the `reviews` table.
- Inventory movements, order status events, sessions, reservations, product attributes, addresses, and notifications require their forward migration to be applied; repositories never self-create tables.
