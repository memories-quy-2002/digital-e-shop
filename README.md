# Digital-E E-commerce System

Digital-E is a full-stack e-commerce system for electronic products. The project is organized as a pnpm workspace with a React storefront, an Express API, MySQL persistence, admin operations tools, and read-only k6 performance tests.

## Tech Stack

| Area | Tools |
| --- | --- |
| Frontend | React 19, Vite, TypeScript, SCSS, React Bootstrap |
| Backend | Node.js, Express 5, MySQL, JWT, CSRF protection |
| State and API | React context, Axios, cookie-based sessions |
| Admin tools | Product, order, account, promotion, notification, analytics, and inventory management |
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

- JWT authentication with refresh/session cookies.
- CSRF protection for unsafe requests.
- Role-based access control for customer and admin routes.
- Schema-aware promotion support for the `discounts` table.
- Read APIs for analytics, products, orders, reviews, wishlist, notifications, addresses, and inventory movements.
- Write APIs for checkout, cart, wishlist, reviews, products, promotions, addresses, notifications, and order status updates.

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
  server/                 Express API
    src/
      config/             Database config
      controllers/        Request handlers
      middlewares/        Auth, logging, error handling
      models/             MySQL query modules
      routes/             API route definitions
      services/           Business logic
      utils/              Shared backend utilities
    test/                 k6 performance scripts
  pnpm-workspace.yaml     Workspace package definition
  pnpm-lock.yaml          Root lockfile for client and server
```

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
- Inventory movement, customer notification, address book, and order timeline tables are created defensively by their backend models when first used.
