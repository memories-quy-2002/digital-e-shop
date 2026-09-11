# Digital-E

Digital-E is a full-stack electronics store with a customer storefront and an operations-focused admin dashboard. The repository contains two independently installable pnpm packages: a React/Vite client and a NestJS API running on Express with MySQL as the primary runtime database.

## What the project includes

### Customer experience

- Catalog search, filters, pagination, facets, recommendations, and product details
- Product reviews and verified-purchase indicators
- Authenticated carts, guest carts, coupon validation, and checkout
- Firebase-only signup and identity verification; Firebase owns verification and sensitive email action links in every environment
- Firebase-based password reset and confirmed email changes; database-backed order/account notifications; marketing subscription and unsubscribe flows removed
- Guest order lookup protected by a one-time access token
- Checkout success and protected guest-order lookup provide order confirmation; no external order-email provider is configured
- Wishlist, reorder, address book, notifications, and order timeline
- Vietnam-first PayOS checkout links with VND quote snapshots, verified webhooks, and deterministic local mock mode
- Optional Stripe Checkout support for international payments
- Responsive storefront, checkout, account, and support pages

### Admin operations

- Dashboard analytics with 7-day, 30-day, and 90-day ranges
- Product management, image upload, soft delete, inventory updates, and CSV export
- Inventory movement and stock-risk views
- Order search, detail views, status transitions, timeline, guest-order compatibility, and CSV export
- Account, promotion, notification, and support-ticket management
- Operational alerts and loading, empty, and error states for admin routes

### Server boundaries

- NestJS modules expose the API under `/api`
- Controllers parse requests and preserve route-local response keys
- Services coordinate business rules and multi-table transactions
- Repositories own MySQL and Prisma persistence details
- Zod validates write payloads before services persist them
- `AuthGuard`, `RolesGuard`, and `OwnerParam` protect sessions, roles, and ownership
- Prisma Migrate owns new forward schema changes while legacy tables remain MySQL-managed

## Technology

| Area | Current implementation |
| --- | --- |
| Client | React 19.2.8, React Router DOM 7.18.3, Vite 8.2.2, TypeScript 6, Tailwind CSS 4, Sass, Axios |
| Client UI | Radix UI primitives, project UI components, Lucide icons, Recharts |
| Server | Node.js 24.20.0, NestJS 11, Express 5 adapter, TypeScript, Zod |
| Data | MySQL through feature repositories, Prisma 7 for the partial migration-owned layer |
| Authentication | Firebase client/Admin verification in every environment, Firebase-owned email actions, cookie-backed JWT access and refresh sessions |
| Payments | Vietnam-first PayOS Checkout links/webhooks, VND settlement quotes, optional Stripe, and local mock provider mode |
| Operations | Pino request logging, request IDs, rate limiting, optional Redis store, Vercel Blob uploads |
| Verification | Vitest, Testing Library, TypeScript checks, ESLint, builds, MySQL integration tests, and read-only k6 scripts |
| Deployment | Separate Vercel projects for `client/` and `server/` |

## Repository layout

```text
digital-e-shop/
  client/
    src/
      app/                 App bootstrap and providers
      components/          Shared layout and UI components
      context/             Auth, cart, toast, and shared client state
      features/            Admin, auth, orders, products, support, and users
      lib/                 HTTP, environment, and shared client utilities
      pages/               Generic route-level pages
      routes/              React Router configuration
      styles/              Tailwind and SCSS styles
  server/
    api/                   Vercel function entrypoint
    src/
      <feature>/           Nest module, controller, service, repository, and types
      config/              Environment, database, CORS, and payment configuration
      core/                Shared middleware and response/error infrastructure
      database/            Prisma schema, migrations, seeders, and legacy dumps
      guards/              Authentication, role, and ownership guards
      middleware/          CSRF, rate limiting, request IDs, and request logging
      shared/              Shared contracts, helpers, and rate-limit infrastructure
  docs/                    Maintained guides, process templates, plans, and specs
  Wiki/                    Durable architecture, concept, decision, and maintenance notes
```

The repository root intentionally has no package manifest or root lockfile. Install and run the client and server from their own package roots.

## Prerequisites

- Node.js `24.20.0`, selected from `.node-version`
- pnpm `12.3.4`
- Docker with WSL support for the local MySQL setup
- k6 only when running performance scenarios

## Local setup

Create local environment files from the tracked templates, then install both packages:

```powershell
Copy-Item client/.env.example client/.env.local
Copy-Item server/.env.example server/.env
Copy-Item server/.env.docker.example server/.env.docker

pnpm --dir client install
pnpm --dir server install
```

Initialize the isolated local database and deterministic demo data:

```powershell
pnpm --dir server docker:setup
```

The local database uses MySQL at `127.0.0.1:3307`, database `digital_e_shop_local`, and the Docker volume `digital_e_shop_local_mysql_data`. The setup imports the checked-in legacy baseline, records the metadata-only Prisma `0_init` marker, applies forward migrations, seeds demo data, and verifies counts and relationships.

The normal demo seed is transactional and idempotent for its owned rows. Run it manually with `pnpm --dir server seed:demo`; `pnpm --dir server dev` only generates Prisma Client and starts the server, so restarting development does not reseed or overwrite data. The separate `demo:reset` workflow is destructive and must remain a deliberate local or protected production operation. Never point local seed commands at a shared or production database.

Run the applications in separate terminals:

```powershell
pnpm --dir server dev
pnpm --dir client dev
```

Default local URLs:

- Storefront: `http://localhost:5173`
- API: `http://localhost:4000`
- Health check: `http://localhost:4000/api/health`
- API reference: `http://localhost:4000/docs`

Local demo accounts and migration details are documented in [`server/README.prisma.md`](./server/README.prisma.md). Use those accounts only with the local demo database.

## Environment configuration

Use [`client/.env.example`](./client/.env.example), [`server/.env.example`](./server/.env.example), and [`server/.env.docker.example`](./server/.env.docker.example) as placeholders. Never commit populated environment files.

The server reads database, JWT, refresh-token, CSRF, CORS, Firebase Admin, Stripe, PayOS, payment-provider, Blob, and optional Redis settings. Production startup requires the database, auth, origin, and live payment variables documented in [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md). Production client builds require `VITE_API_BASE_URL` so a preview cannot silently target the wrong API.

Firebase sends verification, password-reset, and email-change action links for production accounts. The server currently has no generic transactional email provider, so order confirmation email delivery is disabled. Authenticated customers receive database-backed order and status notifications in the app; guests use checkout success and protected order lookup. A future email provider must be added as a separate server-side integration and must not participate in order rollback.

Authentication is Firebase-only. The client signs users in with Firebase Email/Password and sends a Firebase ID token to the API; the server verifies that token with Firebase Admin before issuing its cookie-backed session. Firebase also owns verification, password-reset, and email-change action links. Unsafe requests use the double-submit CSRF flow, while login, registration, and refresh keep their existing explicit exceptions.

New accounts can sign in before email verification. Browse, cart, wishlist, account, support, and order-history access remain available, while authenticated checkout, Stripe checkout-session creation, and review creation require `email_verified=true`. Firebase issues and handles the verification action link; the server does not generate verification tokens or expose a verification delivery endpoint.

## Verification commands

Run checks from the package that owns the code:

```powershell
# Client
pnpm --dir client exec tsc -p tsconfig.json --noEmit
pnpm --dir client lint
pnpm --dir client test -- --run
pnpm --dir client build

# Server
pnpm --dir server typecheck
pnpm --dir server lint
pnpm --dir server test -- --run
pnpm --dir server build
```

Database-backed checks require the isolated local or CI database:

```powershell
pnpm --dir server prisma:validate
pnpm --dir server prisma:migrate:status
pnpm --dir server test:integration
pnpm --dir server demo:verify
```

The server test suite excludes integration files by default. Run `test:integration` only against a disposable database. The k6 scripts are read-only by default:

```powershell
pnpm --dir server perf:readonly
pnpm --dir server perf:catalog
pnpm --dir server perf:admin-readonly
pnpm --dir server perf:customer-readonly
pnpm --dir server perf:auth-readonly
```

Do not run checkout, cart writes, reviews, address writes, notification mutations, product updates, promotion writes, or admin updates against production data during performance testing.

## Documentation

- [Development guide](./docs/DEVELOPMENT.md)
- [Architecture guide](./docs/ARCHITECTURE.md)
- [API guide](./docs/API.md)
- [Testing guide](./docs/TESTING.md)
- [CI/CD and database operations](./docs/ci-cd.md)
- [Prisma and demo database workflow](./server/README.prisma.md)
- [Contributing guide](./CONTRIBUTING.md)
- [Security policy](./SECURITY.md)
- [Code of conduct](./CODE_OF_CONDUCT.md)
- [Changelog](./CHANGELOG.md)
- [Project Wiki](./Wiki/index.md)

## Security

Do not report suspected vulnerabilities in a public issue. Follow [`SECURITY.md`](./SECURITY.md), keep credentials and personal data out of reports, and use local or approved test environments.
