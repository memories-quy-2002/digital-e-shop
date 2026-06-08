# AGENTS.md

## Project overview

Digital-E is a pnpm workspace for a full-stack e-commerce system focused on electronics and components.

It has two deployable applications:

- `client/`: a React 19 + Vite storefront and admin UI.
- `server/`: an Express 5 API serving catalog, cart, checkout, account, admin, and analytics flows.

High-level architecture:

- Frontend: React Router pages, feature-scoped UI modules, React context for auth/cart/toast, Axios for API calls, SCSS for styling.
- Backend: feature-based Express API with `modules/<feature>/routes -> controller -> service -> repository`, plus shared `core`, `config`, `database`, and `shared` layers.
- Data access: primary runtime access is still MySQL through feature repositories; Prisma is present and used in a limited subset of repository reads, not as the dominant persistence abstraction.

For broad tasks that benefit from delegation, also read `docs/CODEX_ORCHESTRATION.md`.

## Tech stack

### Runtime and language

- Node.js
- TypeScript in both packages
- A small amount of JavaScript/CommonJS remains in the server runtime shape

### Frontend

- React `19.2.6`
- React Router DOM `7.16.0`
- Vite `8.0.14`
- SCSS / Sass
- React Bootstrap
- Axios
- Firebase client auth
- Recharts
- Vercel Analytics and Speed Insights
- Vitest test runner config is present

### Backend

- Express `5.2.1`
- MySQL via `mysql`
- Prisma `6.9.0` and `@prisma/client`
- Zod validation
- Passport + Google OAuth 2.0
- `csrf-csrf`
- `jsonwebtoken`
- `express-rate-limit`
- `multer`
- Sharp
- `@vercel/blob`
- MongoDB client is present for one product-related integration path

### Tooling and deployment

- pnpm workspace (`packageManager: pnpm@11.3.0`)
- ESLint flat config in both packages
- Prettier installed
- Vercel config in both `client/vercel.json` and `server/vercel.json`
- k6 scripts for read-only performance checks

## Repository structure

```text
digital-e-shop/
  client/
    src/
      api/          Thin exports into the shared HTTP client layer
      app/          App bootstrap and providers
      assets/       Static images and frontend assets
      components/   Shared common/layout components
      context/      Auth, cart, toast, and shared client state
      features/     Domain-scoped UI and API modules (admin, auth, orders, products, users)
      lib/          Shared frontend infrastructure such as HTTP/env helpers
      pages/        Route-level pages not owned by a feature module
      routes/       Router and lazy route wiring
      services/     External client integrations (for example Firebase)
      stores/       Legacy/low-use store area
      styles/       Shared and page SCSS
      types/        Shared frontend types
      utils/        Formatting and helper utilities

  server/
    api/            Serverless/Vercel entrypoint shim
    src/
      config/       Typed env, CORS, and database config
      core/         Base classes, app errors, middleware, response helpers
      database/     Prisma client/schema, migrations, and seeders
      modules/      Feature-owned routes/controllers/services/repositories/validators/dtos/types
      shared/       Shared constants, interfaces, validation helpers, and utilities
      utils/        Narrow backend utilities still shared across modules
      app.ts        Express composition root
      server.ts     Local process bootstrap
    test/           Read-only k6 scripts

  docs/
    API.md
    ARCHITECTURE.md
    CODEX_ORCHESTRATION.md
    DEVELOPMENT.md
    TESTING.md
```

## Setup commands

Use pnpm only. Do not add npm or yarn lockfiles.

From the repository root:

```powershell
pnpm install
pnpm start
```

Workspace development:

```powershell
pnpm --filter server dev
pnpm --filter client start
```

Package-specific build and checks:

```powershell
pnpm --filter client build
pnpm --filter client lint
pnpm --filter client test

pnpm --filter server build
pnpm --filter server typecheck
pnpm --filter server lint
```

Direct frontend typecheck used in current workflows:

```powershell
client\node_modules\.bin\tsc.cmd -p client\tsconfig.json --noEmit
```

Prisma and DB-related commands currently available:

```powershell
pnpm --filter server prisma:generate
pnpm --filter server prisma:migrate
pnpm --filter server seed:mock
```

Performance scripts:

```powershell
pnpm --filter server perf:readonly
pnpm --filter server perf:admin-readonly
pnpm --filter server perf:customer-readonly
```

Production start points:

```powershell
pnpm --filter server start
pnpm --filter client preview
```

Local defaults:

- Client: `http://localhost:5173`
- Server: `http://localhost:4000`
- Health check: `http://localhost:4000/api/health`

## Environment variables

There is no committed `.env.example` in this repo. The list below is inferred from source usage and scripts. Use placeholders, not real secrets.

### Server

Required for normal local runtime:

```env
NODE_ENV=development
PORT=4000

DB_HOST=<mysql-host>
DB_PORT=<mysql-port>
DB_USER=<mysql-user>
DB_PASSWORD=<mysql-password>
DB_NAME=<mysql-database>
DATABASE_URL=mysql://<user>:<password>@<host>:<port>/<database>

JWT_SECRET_KEY=<jwt-access-secret>
JWT_REFRESH_SECRET_KEY=<jwt-refresh-secret>
CSRF_SECRET=<csrf-secret>

CLIENT_URL=http://localhost:5173
SERVER_URL=http://localhost:4000
```

Optional or feature-specific:

```env
GOOGLE_CLIENT_ID=<google-oauth-client-id>
GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>
GOOGLE_CALLBACK_URL=http://localhost:4000/api/users/auth/google/callback

BLOB_READ_WRITE_TOKEN=<vercel-blob-token>
MONGO_URI=<mongodb-uri>

DB_QUERY_LOG=false
DB_QUERY_LOG_THRESHOLD_MS=200
DB_EXPLAIN_SLOW=false

SEARCHAPI_KEY=<searchapi-key>

MOCK_ORDER_COUNT=<seed-order-count>
MOCK_REVIEW_COUNT=<seed-review-count>
```

### Client

Currently observed client environment usage:

```env
VITE_CLOUDINARY_CLOUD_NAME=<cloudinary-cloud-name>
```

Notes:

- API base URL is currently hard-coded in `client/src/lib/env.ts`, not environment-driven.
- Firebase web config is currently embedded in source, not sourced from env.

## Coding conventions

### TypeScript style

- Frontend TypeScript is `strict: true`.
- Server TypeScript is less strict (`strict: false`, `noImplicitAny: true`).
- Frontend code uses ESM imports.
- Server code mixes CommonJS `require` with TypeScript `import type`; preserve the existing local style within touched files instead of forcing a repo-wide conversion.

### Naming conventions

- React components and pages: `PascalCase` files and component names.
- Hooks and utilities: `camelCase`.
- Backend feature files use `camelCase` filenames with explicit suffixes such as `products.controller.ts`, `orders.service.ts`, `wishlist.repository.ts`.
- Route path names stay descriptive and mostly noun-based.

### Folder and module boundaries

- Put domain-specific client code in `client/src/features/<domain>/`.
- Put generic route pages in `client/src/pages/`.
- Put shared frontend infrastructure in `client/src/lib`, `client/src/context`, `client/src/components/common`, and `client/src/components/layout`.
- Keep backend route/controller/service/repository boundaries explicit inside each feature module.
- Put shared backend types in `server/src/shared/interfaces`.

### Error handling

- Backend handlers commonly return JSON with `msg` on expected failures and `error` for infrastructure-style failures.
- This response shape is not fully uniform across the API. Preserve the existing contract of the specific route you are touching.
- Shared backend error middleware is simple and generic; do not rely on it to normalize all route responses for you.

### Validation

- New write-path validation should use Zod in `server/src/validation/requestSchemas.ts` or a nearby validation module if that file becomes too large.
- Parse and validate request payloads before persistence.
- Do not trust client-provided IDs; pair validation with ownership or role checks.

### Logging

- Logging is currently console-based.
- `requestLogger` logs requests outside production.
- DB slow query logging can be enabled with env flags.
- Do not introduce noisy logs on hot paths. Avoid logging secrets, cookies, tokens, or personal data.

### Database access

- Primary data access lives in `server/src/modules/*/*.repository.ts`.
- Prefer existing MySQL model patterns for most changes.
- Prisma exists but is only partially adopted. Do not assume a full Prisma migration.
- Keep SQL and schema-aware persistence in repositories, not controllers.
- Service layer coordinates multi-table updates such as checkout, inventory, timeline, and notifications.

### API response format

- Expect route-specific payload keys such as `msg`, `error`, `products`, `order`, `orders`, `userData`, `notifications`, `pagination`.
- Avoid "cleaning up" response shapes unless the user explicitly asks for an API contract change.

### Import rules

- Reuse `client/src/lib/http.ts` for authenticated frontend HTTP calls.
- Do not hard-code backend URLs in page components.
- Reuse existing feature `api.ts` files when adding client-side calls in an existing domain.
- On the server, keep dependency imports local to the layer that owns them.

### Frontend conventions

- Use functional components.
- Keep loading, empty, error, and success states explicit.
- Preserve responsive behavior for storefront, account, and admin screens.
- Keep styles in BEM structure.

### Backend conventions

- Keep controllers thin.
- Put cross-table orchestration in services.
- Keep SQL and persistence details in repositories.
  - Enforce `requireAuth`, `requireAdmin`, and `requireOwnerOrAdmin` consistently.

## Architecture rules

When adding or changing features:

### Frontend

- Route pages belong in:
  - `client/src/features/<domain>/pages` for domain-owned screens
  - `client/src/pages` for generic site pages
- Shared UI belongs in `client/src/components/common` or `client/src/components/layout`.
- Shared app infrastructure belongs in `client/src/app`, `client/src/lib`, or `client/src/context`.
- Feature-specific API wrappers belong in `client/src/features/<domain>/api.ts`.
- Shared helpers belong in `client/src/utils` or `client/src/lib`.
- Shared types belong in `client/src/types` or feature-local `types.ts`.

### Backend

- Add or extend routes in `server/src/modules/<feature>/<feature>.routes.ts`.
- Put request parsing and response formatting in feature controllers.
- Put business rules and multi-repository coordination in feature services.
- Put table-specific reads/writes in feature repositories.
- Put feature-local request schemas in `server/src/modules/<feature>/<feature>.validator.ts`.
- Put shared request/domain types in `server/src/shared/interfaces`.
- Put cross-cutting helpers in `server/src/shared`, `server/src/core`, or `server/src/config`.

### Data and auth rules

- API routes are mounted under `/api`, with fallback aliases without `/api` for serverless environments.
- Unsafe requests must preserve the existing CSRF flow.
- Login, register, and refresh are intentionally excluded from CSRF protection; do not broaden those exceptions.
- Customer endpoints must validate ownership.
- Admin endpoints must enforce admin authorization before business logic.

### Shared-code placement

- Use `client/src/features/*/types.ts` for feature-local contracts.
- Use `server/src/shared/interfaces/domain.ts` for shared backend request/DB typing patterns.
- Do not add a new abstraction layer unless the existing structure is clearly insufficient.

## Testing instructions

Current test reality:

- Client has a Vitest config and Testing Library dependencies, but there are no discovered `*.test.*` or `*.spec.*` files under `client/src`.
- Server has no unit/integration test suite in `server/src`; current automated verification is mainly typecheck/lint/build plus read-only k6 scripts.

Use these checks by default:

```powershell
client\node_modules\.bin\tsc.cmd -p client\tsconfig.json --noEmit
pnpm --filter client build
pnpm --filter client test

pnpm --filter server typecheck
pnpm --filter server build
pnpm --filter server lint
```

Add targeted tests for new work where practical:

- Frontend: Vitest + Testing Library component/render tests for new logic-heavy components, route guards, or UI state transitions.
- Backend: add focused tests only if a harness is introduced deliberately; otherwise verify changed flows through targeted runtime checks and keep logic isolated enough to test later.
- Performance: use k6 only for read-only paths unless a cloned test DB exists.

If you cannot run a relevant command, say so explicitly in the final report.

## Database instructions

- Prisma schema lives at `server/src/database/prisma/schema.prisma`.
- The checked-in SQL dump baseline lives under `server/src/database/migrations/`.
- The operational runtime still relies mainly on feature repositories in `server/src/modules/*/*.repository.ts`.

Current workflow:

- Generate Prisma client:

```powershell
pnpm --filter server prisma:generate
```

- Apply Prisma dev migration if you are intentionally using Prisma migrations:

```powershell
pnpm --filter server prisma:migrate
```

- Mock data seed currently available:

```powershell
pnpm --filter server seed:mock
```

Safe schema-change rules:

- Do not edit schema casually; schema changes affect both raw MySQL queries and the partial Prisma layer.
- Keep table and column names aligned with existing dump/schema conventions.
- Prefer additive, reviewable DB changes.
- If you add a new table or column, update every affected layer: repositories, services, validators, shared/feature types, and any Prisma schema touched by the flow.
- Be careful with checkout, inventory, order timeline, addresses, and notifications because those paths coordinate multiple tables.

## Security and production constraints

- Never commit secrets, `.env` files, tokens, private cookies, or production credentials.
- Validate all write payloads before persistence.
- Preserve auth, CSRF, CORS, and role/ownership checks.
- Do not bypass `requireAuth`, `requireAdmin`, or `requireOwnerOrAdmin` for convenience.
- Avoid unsafe SQL construction. If raw SQL is required, parameterize it whenever possible and review any `$queryRawUnsafe` usage carefully.
- Preserve existing API contracts unless a contract change is explicitly requested.
- Be cautious in performance-sensitive paths:
  - product listing, search, and facets
  - cart validation and checkout
  - admin analytics
  - order history and notification reads
- Do not add dependencies without a concrete need and compatibility check.
- For dependency changes, keep lockfile churn minimal and prefer patch/minor updates unless a larger change is required.

## Git and PR workflow

Long-lived branch structure:

- `production`: live code served to end users. Never commit directly.
- `main`: release-ready code. Always deployable. Source of truth before each release.
- `dev`: integration branch. All feature work lands here first.

Branch naming:

- `feature/<short-description>` for new functionality, branched from `dev`.
- `bugfix/<short-description>` for non-urgent bug fixes, branched from `dev`.
- `hotfix/<short-description>` for urgent production fixes, branched from `production`.
- `release/<version>` for release prep when needed, branched from `dev`.

Standard flow:

1. Branch from `dev`.
2. Develop and commit on the feature or bugfix branch.
3. Open a PR into `dev`; reviews and CI must pass before merge.
4. Validate `dev` for QA/staging.
5. Open a PR from `dev` into `main`.
6. Tag releases on `main`, then promote/deploy to `production`.

Hotfix flow:

1. Branch from `production` using `hotfix/<name>`.
2. Fix, commit, and open a PR into `production`.
3. After merge, immediately back-merge the hotfix into both `main` and `dev`.

Rules:

- Never push directly to `production` or `main`.
- Never merge `main` into `dev`; flow is one-directional: `dev` to `main` to `production`.
- Every change should go through a pull request with at least one review.
- Delete feature and bugfix branches after merge.
- Hotfix branches must be back-merged to both `main` and `dev` before deletion.
- Always confirm the current branch before suggesting or performing a merge.
- Ask for explicit confirmation before any task touches `main` or `production`.
- Flag any action that would violate this flow and explain why.

Commit messages should use Conventional Commit style:

```text
<type>(<scope>): <short summary>
```

Allowed common types:

- `feat`
- `fix`
- `refactor`
- `test`
- `chore`
- `docs`

Before opening a PR, run the relevant checks for the changed surface. PR summaries should include changed files, behavior changes, verification, assumptions, and remaining risks. Include screenshots for substantial UI changes when possible.

## Codex working rules

- Read this `AGENTS.md` before starting repo work and re-read it after resume/compaction.
- For broad tasks that need delegation, read `docs/CODEX_ORCHESTRATION.md`.
- Use Context7 when the task is about a library, framework, SDK, API, CLI tool, or cloud service. Resolve the library ID first, then query the docs.
- Inspect existing patterns before editing.
- Use CodeGraph for structural lookup before broad manual scanning when it is available.
- Before spawning a new sub-agent, check whether an existing Codex sub-agent is already active and suitable for the task. Reuse active sub-agents when their current role matches or is close enough. Spawn a new sub-agent only when the task is materially different from the work the existing sub-agents are already handling, or when parallel ownership needs to stay isolated.
- Make the smallest safe change that satisfies the request.
- Avoid large rewrites unless explicitly requested.
- Do not add dependencies without justification.
- Update docs when behavior, commands, or architecture expectations change.
- Run the most relevant checks before the final response.
- Mention any commands that could not be run and why.
- Preserve existing public APIs, route aliases, cookie flow, and CSRF behavior unless explicitly asked to change them.

## Known gaps / TODOs

These are directly observable from the current repo:

- No committed `.env.example` or `.env.sample` file exists.
- Root `package.json` defines `pnpm dev` as `pnpm --filter client dev`, but `client/package.json` has no `dev` script; the active Vite script is `start`.
- Client has both Vitest/Jest-related dependencies and config fragments, but no discovered frontend test files.
- Server has no unit/integration test suite; only k6 read-only performance scripts are present.
- Prisma schema exists, but there is still no checked-in Prisma migration history from `prisma migrate`.
- A root workspace lockfile coexists with nested `client/pnpm-lock.yaml` and `server/pnpm-lock.yaml`, which can drift.
- `client/src/lib/env.ts` hard-codes the production API base URL instead of reading from env.
- The backend now has both a feature-based architecture and some compatibility-era wrapper patterns; not every feature validator/type file is fully independent yet.
- Backend response payload shapes are inconsistent across routes (`msg` vs `error` and route-specific data keys), so callers must preserve route-local contracts carefully.
