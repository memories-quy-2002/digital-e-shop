# Overview

Back to [[index]].

## Runtime baseline

- Node.js `24.20.0` is selected by `.node-version`.
- pnpm `12.3.4` is declared by both package manifests and CI.
- `client/` and `server/` are independent pnpm packages. The repository root
  is not a workspace and has no supported root install or filter command.
- Production client builds require `VITE_API_BASE_URL`.
- Production server startup validates database, authentication, and origin
  configuration before serving requests.

## Purpose

Digital-E is a full-stack e-commerce system for electronic components and
devices. It provides a customer storefront and account area, guest and
authenticated checkout, and an admin operations dashboard.

## Current stack

| Area | Tools |
| --- | --- |
| Package management | Independent pnpm packages, pnpm `12.3.4`, no root workspace |
| Frontend | React `19.2.8`, React Router DOM `7.18.3`, Vite `8.2.2`, TypeScript `6.0.3`, Tailwind CSS `4.3.3`, Radix UI, SCSS/Sass, Axios, Firebase client auth, Recharts |
| Backend | NestJS `11.2.3` on Express `5.2.1`, TypeScript `6.0.3`, MySQL (`mysql`/`mysql2`), Prisma `7.10.0` partial layer, Zod, cookie/CSRF middleware, JWT, rate limiting, Stripe, Firebase Admin, Redis support, Pino, Vercel Blob |
| Delivery and verification | Vercel configs, GitHub Actions, Vitest, disposable MySQL integration checks, read-only k6 scripts |

## High-level modules

- **Frontend** - domain UI and API wrappers live under
  `client/src/features/` (`admin`, `auth`, `orders`, `products`, `support`,
  `users`). Generic pages live in `client/src/pages/`; shared state and HTTP
  infrastructure live in `client/src/context`, `client/src/lib`, and shared
  components.
- **Backend** - the Nest root is `server/src/app.module.ts`; `main.ts`
  bootstraps the cached app used by local and serverless entrypoints. Feature
  folders under `server/src/` own controllers, services, repositories, DTOs,
  validators, types, and focused tests where applicable.
- **Cross-cutting backend** - `guards/`, `pipes/`, `filters/`,
  `interceptors/`, `middleware/`, `config/`, `database/`, `payments/`, and
  `shared/` provide authentication, validation, observability, persistence,
  payment boundaries, and common contracts.
- **Data** - MySQL repositories remain the dominant runtime persistence layer.
  Prisma 7 is used for schema generation, forward migrations, and a limited
  subset of repository access; it is not a full persistence rewrite.

## Important commands

```powershell
pnpm --dir client install
pnpm --dir server install
pnpm --dir server docker:setup    # local MySQL import, migrations, seed, verify
pnpm --dir server dev
pnpm --dir client dev

# Verification
pnpm --dir client exec tsc -p tsconfig.json --noEmit
pnpm --dir client test -- --run
pnpm --dir client build
pnpm --dir client lint
pnpm --dir server typecheck
pnpm --dir server test -- --run
pnpm --dir server test:integration
pnpm --dir server build
pnpm --dir server lint

# Database and Prisma
pnpm --dir server prisma:generate
pnpm --dir server prisma:validate
pnpm --dir server prisma:migrate:status
pnpm --dir server prisma:migrate
pnpm --dir server demo:verify
```

Local defaults are client `http://localhost:5173`, server
`http://localhost:4000`, health `http://localhost:4000/api/health`, and API
reference `http://localhost:4000/docs`.

## Local data and deployment assumptions

Local database setup is isolated from production. Copy the tracked server
environment template, run `pnpm --dir server docker:setup`, and use the
`digital_e_shop_local` MySQL database on `127.0.0.1:3307`. Runtime, Prisma,
and demo-seed guards reject remote targets by default; intentional remote
development requires `ALLOW_REMOTE_DATABASE=true`. CI uses a separate
`digital_e_shop_ci` database.

The demo seed is transactional and idempotent. It creates linked admin and
customer accounts, catalog records, carts, orders, reviews, wishlists,
addresses, notifications, sessions, discounts, and inventory movements.
`demo:verify` checks demo-owned counts, image coverage, order/review/wishlist
links, order totals, and relationship orphan counts. It refuses production or
other remote targets.

CI keeps client and server checks separate, starts disposable MySQL, validates
the legacy SQL baseline plus forward Prisma migrations, runs the server
integration suite, and performs HTTP smoke checks. Production migration and
manual demo reset are protected GitHub Environment workflows; Vercel hosting
and branch protection remain repository/deployment settings.

## Current assumptions

- MySQL remains the dominant persistence layer; Prisma is intentionally partial.
- API response shapes are route-specific (`msg`, `error`, and feature data
  keys); preserve the contract of the route being changed.
- Unsafe requests retain CSRF protection. Login, registration, and refresh are
  explicit exclusions; do not broaden that exception.
- `AuthGuard`, `RolesGuard`, and `OwnerParam` enforce authentication, roles,
  and ownership at the Nest boundary.
- Guest checkout uses a browser-local cart and a one-time raw token whose
  SHA-256 hash is stored server-side; server preview and checkout remain
  authoritative for price, stock, promotions, and totals.
- Client and server each have Vitest coverage; the server also has an opt-in
  MySQL-backed integration suite and read-only k6 scripts.
- `Wiki/` records current understanding and decisions; completed plans and
  specs under `docs/superpowers/` remain historical records rather than live
  runbooks.
