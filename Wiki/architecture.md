# Architecture

Back to [[index]]. See also [[overview]] and the deeper human guide in [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md).

## Folder structure

```text
digital-e-shop/
  client/                 React 19 + Vite storefront and admin UI
    src/
      api/                Thin exports into the shared HTTP client layer
      app/                App bootstrap and providers
      assets/             Static images
      components/         common/ and layout/ shared components (incl. admin/)
      context/            Auth, cart, toast, shared client state
      features/           Domain modules: admin, auth, orders, products, users
      lib/                HTTP/env helpers and shared infrastructure
      pages/              Route-level pages not owned by a feature
      routes/             Router and lazy route wiring
      services/           External integrations (e.g. Firebase)
      utils/              Formatting and helpers
  server/                 Express 5 API
    api/                  Serverless/Vercel entrypoint shim
    src/
      config/             Typed env, CORS, database config
      core/               Base classes, app errors, middleware, response helpers
      database/           Prisma client/schema, migrations, seeders
      modules/            Feature-owned routes/controllers/services/repositories/validators/dtos/types
      shared/             Shared constants, interfaces, validation helpers, utilities
      utils/              Narrow backend utilities
      app.ts              Express composition root
      server.ts           Local process bootstrap
    test/                 Read-only k6 scripts
  docs/                   Human guides + bmad/ + ai-prompts/
  Wiki/                   This knowledge base
```

## Boundaries

### Frontend
- Domain-owned screens live in `client/src/features/<domain>/pages`; generic site pages in `client/src/pages`.
- Feature API wrappers in `client/src/features/<domain>/api.ts`; authenticated calls go through `client/src/lib/http.ts` — never hard-code backend URLs in components.
- Functional components only; explicit loading/empty/error/success states; BEM-structured SCSS; responsive across storefront, account, and admin.

### Backend
- Each feature module keeps explicit `routes → controller → service → repository` layers.
- Controllers stay thin (parse/format). Services own cross-table orchestration (checkout, inventory, timeline, notifications). Repositories own SQL/persistence.
- Validation via Zod in feature validators; shared request/domain types in `server/src/shared/interfaces`.
- Routes mounted under `/api`, with fallback aliases without `/api` for serverless. Enforce `requireAuth`, `requireAdmin`, `requireOwnerOrAdmin`.

### Database
- Primary access through `server/src/modules/*/*.repository.ts` (MySQL). Prisma schema at `server/src/database/prisma/schema.prisma` is partially adopted. See [[0001-mysql-primary-prisma-partial]].
- **Prisma 7**: uses the rust-free `prisma-client` generator (`moduleFormat = "cjs"`, `runtime = "nodejs"`) emitting to `server/src/generated/prisma` (gitignored, rebuilt on install/build). The datasource URL lives in `server/prisma.config.ts` — not the schema — and the runtime connects via the `@prisma/adapter-mariadb` driver adapter (MySQL-compatible) constructed in `server/src/database/prisma/client.ts`.
- **DB connection is env-driven** (`DB_HOST/PORT/USER/PASSWORD/NAME` in `server/src/config/database.config.ts`). Managed MySQL (Aiven) requires TLS: set `DB_SSL=true` to load the CA at `server/src/database/ca.pem` (override via `DB_SSL_CA_PATH`) and connect over verified SSL; leave `DB_SSL` unset for plaintext local/Docker. Docker is test-only, driven by its own env and the `docker:*` scripts.
- SQL baseline dump under `server/src/database/migrations/`. Some tables (inventory movement, notifications, address book, order timeline) are created defensively on first use.
- Keep table/column names aligned with the existing dump/schema. Prefer additive, reviewable changes; update all affected layers (repository, service, validator, types, Prisma) together.
- **Build assets**: non-`.ts` runtime files (`docs/openapi.json`, `database/ca.pem`) are not emitted by `tsc`; `server/scripts/copy-assets.mjs` (wired into `build`/`vercel-build`) copies them into `dist/` so `pnpm start` resolves them.

## Important observations

- Auth is cookie-based JWT (access + refresh) with CSRF protection on unsafe requests; login/register/refresh are intentionally excluded from CSRF — do not broaden.
- The backend mixes feature-based architecture with some compatibility-era wrapper patterns.
- Logging is Pino-based on the server; avoid noisy hot-path logs and never log secrets/PII.

## Risks / unknowns

- Response payload inconsistency across routes — callers must preserve route-local contracts.
- Root lockfile coexists with nested `client/`/`server/` lockfiles, which can drift.
- No Prisma migration history committed despite the schema existing.
- No committed `.env.example`; environment contract is inferred.
- Performance-sensitive paths to treat carefully: product listing/search/facets, cart validation/checkout, admin analytics, order history and notification reads.

> Update this page (and [[log]] + the date in [[index]]) whenever you change architecture, boundaries, or the data model.
