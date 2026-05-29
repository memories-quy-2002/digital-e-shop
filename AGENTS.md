# AGENTS.md

## Project Overview

Digital-E is a full-stack e-commerce system for electronic components and devices.

This repository is a pnpm workspace with two main packages:

- `client/`: React 19 + Vite + TypeScript + SCSS storefront/admin UI.
- `server/`: Node.js + Express 5 + TypeScript API backed by MySQL.

Default branch: `master`.

## Package Manager

Use `pnpm`. Do not introduce npm/yarn lockfiles.

Workspace packages:

`client`
`server`

## Common root commands

```powershell
pnpm install
pnpm dev
pnpm start
```

## Package-specific commands

```powershell
pnpm --filter client start
pnpm --filter client build
pnpm --filter client test

pnpm --filter server dev
pnpm --filter server build
pnpm --filter server typecheck
pnpm --filter server lint
```

## Local URLs

- Client: <http://localhost:5173>
- Server: <http://localhost:4000>
- Health check: <http://localhost:4000/api/health>

## Repository Structure

```text
digital-e-shop/
  client/
    src/
      api/          Axios client and request helpers
      components/   Pages, layouts, common UI, admin UI
      context/      Auth, cart, toast, shared client state
      routes/       App route definitions
      services/     Firebase/client services
      styles/       SCSS page and layout styles
      utils/        Formatting and shared helpers

  server/
    src/
      config/       Database config
      controllers/  Request/response handling
      middlewares/  Auth, CSRF, rate limit, logging, errors
      models/       MySQL queries and schema-specific persistence
      routes/       Express route definitions
      services/     Business rules and orchestration
      utils/        Shared backend utilities
      types/        Backend domain/request/response types
    test/           k6 read-only performance scripts

  docs/
    ARCHITECTURE.md
    API.md
    DEVELOPMENT.md
    TESTING.md
```

## Development Principles

Prefer small, scoped, reviewable changes.

## Before editing

- Inspect only the files relevant to the task.
- Identify the minimum set of files that need changes.
- Avoid broad refactors unless explicitly requested.
- Preserve existing behavior unless the task requires changing it.
- Do not rewrite unrelated modules, reformat unrelated files, or introduce unnecessary dependencies.

## Frontend Guidelines

The client uses React, Vite, TypeScript, SCSS, React Bootstrap, Axios, React Router, React context, and some Redux packages.

### Follow these rules

- Keep page components focused on rendering and user interaction.
- Put shared network behavior in client/src/api.
- Reuse existing context providers in client/src/context.
- Keep reusable UI/layout pieces in the appropriate components subfolder.
- Use existing SCSS structure in client/src/styles.
- Do not hard-code backend URLs inside page components.
- Preserve existing cookie-based auth and CSRF request flow.
- Add clear loading, empty, error, and success states for data-driven UI.
- Keep admin tables, filters, cart, checkout, product cards, header, and footer responsive.

### When adding or changing API calls

- Use the existing Axios helper/config pattern.
- Include credentials/cookies according to the existing pattern.
- For unsafe requests, make sure the CSRF token flow is respected.

## Backend Guidelines

The backend follows this split:

```text
Route -> Controller -> Service -> Model -> MySQL
```

### Responsibilities

- `routes/`: HTTP shape and middleware composition.
- `controllers/`: parse request data, call services, return responses.
- `services/`: business rules, validation, orchestration.
- `models/`: SQL queries and schema-specific persistence.
- `middlewares/`: auth, CSRF, rate limit, logging, error handling.

### Rules

- Keep controllers thin.
- Do not put direct SQL in controllers.
- If a feature touches multiple tables, coordinate it in a service.
- Keep SQL and schema-specific logic inside models.
- Use clear status codes and actionable error messages.
- Admin routes must enforce admin authorization before business logic.
- Customer routes must validate ownership; never allow one customer to read or mutate another customer's data.
- The server uses cookie-based auth, JWT/session cookies, CSRF protection, and CORS.

### Important details

- API routes are mounted under /api.
- Some fallback routes exist without /api for serverless environments.
- Unsafe requests require the existing CSRF token flow.
- CSRF token endpoints exist at /api/csrf and /csrf.
- Login, register, and refresh are excluded from CSRF protection.
- Do not bypass CSRF globally.
- Do not weaken cookie, CORS, auth, or role checks for convenience.

### When debugging auth issues

- Check cookies/session/refresh token behavior.
- Check CSRF token generation and X-CSRF-Token usage.
- Check CORS credentials and allowed origins.
- Check route aliases under /api/* and fallback non-/api routes.

## Database Rules

Use the existing MySQL model layer.

### Important table/domain notes

- Promotions are stored in discounts.
- Cart data is stored in carts.
- Product rating and review totals are derived from reviews.
- Prefer soft deletes for products.
- Record inventory movements whenever stock changes.
- Order timeline, inventory movement, customer notification, and address book tables may be created defensively by backend models when first used.

### For order-related changes, coordinate

- Order status updates.
- Tracking timeline events.
- Inventory movement entries.
- Customer notifications when meaningful status changes occur.

### For admin list endpoints

- Keep responses paginated.
- Apply filters against the full dataset, not only the current page.
- Return minimal row data for tables.
- Use detail endpoints or modals for heavier data.
- API Areas.

### Typical public read paths

```sql
GET /api/health
GET /api/products
GET /api/products/:id
GET /api/reviews/product/:productId
```

### Customer areas include

```sql

GET    /api/users/:id/orders
GET    /api/users/:id/addresses
POST   /api/users/:id/addresses
PUT    /api/users/:id/addresses/:addressId
DELETE /api/users/:id/addresses/:addressId
GET    /api/users/:id/notifications
POST   /api/users/:id/notifications/read-all
```

### Admin areas include

- Products
- Orders
- Accounts
- Dashboard analytics
- Promotions
- Notifications
- Inventory
- CSV exports

Before implementing API changes, inspect server/src/routes for exact route definitions.

## Testing and Verification

Prefer targeted verification based on changed files.

## Frontend checks

```powershell
client\node_modules\.bin\tsc.cmd -p client\tsconfig.json --noEmit
cd client
.\node_modules\.bin\vite.cmd build
pnpm test
```

## Server checks

```powershell
pnpm --filter server typecheck
pnpm --filter server build
pnpm --filter server lint
```

For backend syntax checks on changed files:

```powershell
cd server
node --check src\app.js
node --check src\routes\userRoutes.js
node --check src\routes\productRoutes.js
```

Add more `node --check` commands for changed route, controller, service, model, or middleware files when applicable.

## k6 Performance Tests

```powershell
k6 scripts are intended to be read-only.
```

### Safe public read-only test

```powershell
cd server
k6 run test/performance-test.js
```

### Admin read-only test

```powershell
cd server
$env:COOKIE="session=...; accessToken=..."
k6 run test/k6-admin-readonly.js
```

### Customer read-only test

```powershell
cd server
$env:USER_ID="your-user-id"
$env:COOKIE="session=...; accessToken=..."
k6 run test/k6-customer-readonly.js
```

Do not run write-heavy load tests against real/shared data.

Avoid write-heavy performance tests for:

- Checkout/order creation.
- Cart writes.
- Review creation.
- Address writes.
- Notification writes.
- Product updates/deletes.
- Promotion creation/updates.

Use a cloned test database for write workflow performance testing.

## Code Style

### General

- Prefer TypeScript.
- Keep code readable, explicit, and maintainable.
- Avoid unnecessary abstractions.
- Avoid unnecessary dependencies.
- Keep diffs minimal.
- Preserve existing naming and folder conventions.
- Prefer strongly typed request/response/domain shapes where the codebase already supports it.

### Frontend

- Prefer functional React components.
- Keep state close to where it is used.
- Extract shared logic only when reuse is real.
- Avoid duplicating API request logic in components.
- Avoid large components that mix data fetching, formatting, layout, and business rules.

### Backend

- Validate inputs before persistence.
- Do not trust client-provided user IDs without auth/ownership checks.
- Keep auth/role checks explicit.
- Avoid N+1 queries on list/detail endpoints.
- Avoid loading full datasets when pagination/filtering can be done in SQL.
- Keep error handling consistent with existing middleware.
- Security Rules

Never commit secrets or `.env` files.

### Do not expose

- JWT secrets.
- CSRF secrets.
- Database credentials.
- Production cookies.
- Vercel tokens.
- Any private user/customer data.

### For auth, admin, checkout, payment, order, account, and inventory code

- Prefer correctness and explicit validation over quick fixes.
- Do not remove security middleware to make tests pass.
- Do not bypass CSRF or role checks.
- Do not leak sensitive data in API responses or logs.
- Codex Workflow

### When working on this repo, use this process

- Read this `AGENTS.md`.
- For broad tasks that need delegation, read `docs/CODEX_ORCHESTRATION.md` and use its main-agent plus sub-agent pattern.
- Inspect `README.md` and relevant docs only when needed.
- Inspect the smallest relevant file set for the task.
- Summarize the intended change plan before editing if the task is broad.
- Make minimal changes.
- Run the most relevant verification commands.

### Summarize

- Files changed.
- Behavior changed.
- Verification run.
- Any assumptions or follow-up risks.

### For token efficiency

- Do not scan the whole repository unless explicitly asked.
- Start from package.json, relevant docs, route files, and direct imports.
- Use symbol/file search before opening large files.
- Prefer targeted edits over project-wide rewrites.
