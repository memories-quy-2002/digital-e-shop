# AGENTS.md

Project rules. Read before repo work and after resume/compaction.

## Tech Stack

- Runtime: Node.js `24.22.1` (`.node-version`), pnpm `12.4.2`; independent `client/` and `server/` packages, no root workspace. Use pnpm only; do not add npm/yarn lockfiles. Dependency ranges are in package manifests; resolved versions in package-local lockfiles.
- Client: React 19, React Router DOM 7, Vite 8, TypeScript 6 (`strict: true`), Tailwind CSS 4/Radix, SCSS, Axios, Firebase client auth, Recharts, Vercel Analytics/Speed Insights, Vitest.
- Server: NestJS 11/Express 5, TypeScript (`noImplicitAny: true`, `strict: false`), MySQL/mysql2 (primary runtime persistence), partial Prisma 7, Zod, `csrf-csrf`, `jsonwebtoken`, `express-rate-limit`, multer, Sharp, `@vercel/blob`.
- Tooling: package-local ESLint flat configs, Prettier, Vercel configs, read-only k6 scripts. `server/tsconfig.strict.json` is opt-in; migrate strictness feature by feature.

## Commands

Run from repo root; install and run packages independently.

```powershell
pnpm --dir client install
pnpm --dir server install
pnpm --dir server dev
pnpm --dir client dev
pnpm --dir client build
pnpm --dir client lint
pnpm --dir client test
pnpm --dir client test -- --run
pnpm --dir client exec tsc -p tsconfig.json --noEmit
client\node_modules\.bin\tsc.cmd -p client\tsconfig.json --noEmit
pnpm --dir server build
pnpm --dir server typecheck
pnpm --dir server lint
pnpm --dir server test -- --run
pnpm --dir server test:integration
pnpm --dir server prisma:generate
pnpm --dir server prisma:migrate
pnpm --dir server seed:mock
pnpm --dir server perf:readonly
pnpm --dir server perf:admin-readonly
pnpm --dir server perf:customer-readonly
pnpm --dir server start
pnpm --dir client preview
```

- URLs: client `http://localhost:5173`; server `http://localhost:4000`; health `http://localhost:4000/api/health`.
- Client: Vitest/Testing Library. Server: Vitest; integration requires isolated MySQL; portable Docker command-plan tests do not need DB. Use k6 on read-only paths unless using a cloned test DB.
- Run checks relevant to changed surface. Doc-only changes need no app build. Report every check and result; never claim unrun checks passed.

## Architecture

- Client: `client/src/features/<domain>/` owns domain UI, `pages/`, `api.ts`, `types.ts`; generic pages in `client/src/pages/`; shared UI in `client/src/components/common|layout/`; app infrastructure in `client/src/app|lib|context/`; helpers in `client/src/utils|lib/`; shared types in `client/src/types/`. Other folders: `api/` thin exports, `assets/`, `routes/`, `services/`, `styles/`.
- Server: `server/api/` Vercel shim; `server/src/<feature>/` Nest module/controller/service/repository/validator/DTO/types; shared interfaces in `server/src/shared/interfaces/`. Cross-cutting code: `config/`, `core/`, `database/`, `guards/`, `pipes/`, `filters/`, `interceptors/`, `middleware/`, `payments/`, `shared/`, `utils/`; roots `app.module.ts`, `main.ts`, `server.ts`; k6 scripts in `server/test/`.
- Guides: `docs/API.md`, `docs/ARCHITECTURE.md`, `docs/CODEX_ORCHESTRATION.md`, `docs/DEVELOPMENT.md`, `docs/TESTING.md`, `docs/DATABASE_CONCURRENCY_PERFORMANCE.md`; task prompts in `docs/ai-prompts/`.
- Frontend: React Router pages, feature UI, auth/cart/toast contexts, Axios. Reuse `client/src/lib/http.ts` and existing feature `api.ts`; never hard-code backend URLs in pages.
- Backend: thin controllers; services coordinate business and multi-table work; repositories own SQL/persistence. Keep MySQL primary; Prisma is limited to selected reads/migrations. Keep dependency imports in the owning layer.
- API prefix `/api` is set in `main.ts`. Preserve documented singular/plural aliases; do not add bare-path fallback without verifying serverless contract. Preserve route-specific response keys (`msg`, `error`, `products`, `order`, `orders`, `userData`, `notifications`, `pagination`). `AllExceptionsFilter` adds error metadata/aliases; response interceptor adds success metadata without moving route data. Contract: `Wiki/concepts/api-response-contract.md`.
- Client production requires explicit `VITE_API_BASE_URL` (localhost default is development-only). Firebase uses six required `VITE_FIREBASE_*` build variables and optional `VITE_FIREBASE_MEASUREMENT_ID`; these are public client config. Production project: `graduation-project-5bbfb`; reject client Auth Emulator URL. Images use Vercel Blob via `PRODUCT_IMAGE_BASE_URL` in `client/src/utils/images.ts`, not Cloudinary.

### Database

- Read `docs/DATABASE_CONCURRENCY_PERFORMANCE.md` before transaction, locking, index, or catalog-query changes.
- Keep persistence in feature repositories; services coordinate checkout, inventory, timelines, notifications, etc. Do not migrate all persistence to Prisma.
- Single-row arithmetic: conditional `UPDATE` + `affectedRows`; multi-row invariants: ordered `SELECT ... FOR UPDATE` on the same transaction connection; human edits: revision compare-and-swap. Do not replace with client-side reads.
- `withRetryableTransaction` only replays DB-only, replay-safe callbacks after confirmed rollback. Never retry provider calls, external side effects, or ambiguous COMMIT outcomes.
- Bound expensive aggregates to product IDs where possible; preserve pagination/contracts; justify indexes with `EXPLAIN`.
- Prisma schema: `server/src/database/prisma/schema.prisma`; checked-in legacy SQL baseline: `server/src/database/migrations/`; runtime remains mainly `server/src/<feature>/*.repository.ts`.
- Keep table/column names aligned; prefer additive schema changes and update affected repositories, services, validators, types, and Prisma schema. Treat checkout, inventory, order timeline, addresses, and notifications as coordinated paths. Integration needs isolated MySQL; k6 is read-only unless using a cloned DB.

## Coding Conventions

- Format JS/TS/CSS/SCSS/JSON/HTML/YAML/Markdown with Prettier; ESLint checks quality/framework rules, not whitespace. Keep package `format`/`format:check` aligned with root config.
- Preserve local module style: frontend ESM; server may mix CommonJS `require` and TS `import type`. Do not force repo-wide conversion or broaden strict exceptions.
- Names: React components/pages `PascalCase`; hooks/utilities `camelCase`; server filenames `kebab-case` with Nest role suffixes (e.g. `payment-reconciliation.service.ts`); descriptive, mostly noun-based routes.
- Client: functional components; explicit loading/empty/error/success states; responsive storefront/account/admin; BEM styles.
- Validate new writes with feature-owned Zod `*.validator.ts`; use shared validation only for cross-feature rules. Parse before persistence. Shared parsing/error formatting: `server/src/shared/validation/request-validation.ts`; do not re-export feature schemas there.
- Do not trust client IDs/prices/stock/totals/payment status; enforce ownership/role with `AuthGuard`, `RolesGuard`, `OwnerParam`.
- Add abstractions only for concrete boundary needs. Pino logs method/URL/status/duration/request ID; never log secrets, cookies, tokens, or personal data; avoid hot-path noise. DB flags: `DB_QUERY_LOG`, `DB_QUERY_LOG_THRESHOLD_MS`, `DB_EXPLAIN_SLOW`; no diagnostic queries on hot production paths.

## Guardrails/Don'ts

### Environment and secrets

- Templates: `client/.env.example`, `server/.env.example`, `server/.env.docker.example`; placeholders only. Never commit `.env`, secrets, tokens, private cookies, or production credentials.
- Server local vars: `NODE_ENV=development`, `PORT=4000`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DATABASE_URL=mysql://<user>:<password>@<host>:<port>/<database>`, `JWT_SECRET_KEY`, `JWT_REFRESH_SECRET_KEY`, `CSRF_SECRET`, `CLIENT_URL=http://localhost:5173`, `SERVER_URL=http://localhost:4000`.
- Optional: `BLOB_READ_WRITE_TOKEN`, `DB_QUERY_LOG=false`, `DB_QUERY_LOG_THRESHOLD_MS=200`, `DB_EXPLAIN_SLOW=false`, `MOCK_ORDER_COUNT`, `MOCK_REVIEW_COUNT`.
- Production requires `PAYMENT_PROVIDER_MODE=live` and PayOS credentials. Firebase Admin requires `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` outside Auth Emulator; production rejects emulator. MySQL pool uses `DB_PASSWORD`, though startup missing-key list omits it. Full matrix: `docs/DEVELOPMENT.md#production-deployment-variables`.

### Security and compatibility

- Preserve auth, CSRF, CORS, role/ownership checks, cookie flow, route aliases, API contracts, and transaction boundaries. Never bypass guards/ownership. Login/register/refresh are the only intentional CSRF exemptions; preserve unsafe-request CSRF flow.
- Customer endpoints validate ownership; admin authorization precedes business logic. Validate every write payload before persistence.
- Parameterize raw SQL; review `$queryRawUnsafe` carefully. Do not change global isolation or assume production isolation level. Do not casually run `prisma db push` or `prisma migrate reset` on data-bearing DBs.
- Protect hot paths: product listing/search/facets, cart validation/checkout, admin analytics, order history, notification reads. Add dependencies only for concrete need/compatibility; minimize lockfile churn and prefer patch/minor updates. Make schema changes additive/reviewable; follow DB guide for locking, retries, profiling, rollout.

### Git and delivery

- Remote long-lived branch is `main` (release/production); historical `dev`, `production`, `feature/github-actions-cicd` are deleted. If uncertain, run `git ls-remote --heads origin`; do not trust stale local refs.
- Branch from `main`: `feature/<short-description>`, `bugfix/<short-description>`, `hotfix/<short-description>`. Flow: branch -> commit -> PR to `main` -> one review + passing CI -> delete branch after merge.
- Never push directly to `main`; explicitly confirm before any task touches `main`. Verify current branch before merge; flag flow violations. Update this rule if user restores multi-branch flow.
- Conventional Commit: `<type>(<scope>): <short summary>`; common types: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`.
- Before PR, run relevant checks. Summaries include files, behavior, verification, assumptions, risks; include screenshots for substantial UI changes when possible. Main Codex owns Git; do not commit/push/create PR/merge/deploy unless requested/authorized.

### Workflow and delegation

- For every repo request, read `docs/ai-prompts/README.md` and choose one closest prompt automatically: `feature.md`, `bugfix.md`, `refactor.md`, `review.md`, `test.md`, `wiki-ingest.md`. Follow its required skills; prompt selection does not expand scope. Use `find-skills` for missing capability or explicit skill discovery.
- Inspect guidance, branch/worktree, patterns, and `Wiki/index.md` before major changes. Use GitNexus before broad scans; use Context7 for library/framework/SDK/API/CLI/cloud behavior. Read `docs/CODEX_ORCHESTRATION.md` before broad delegation.
- Non-trivial work: inspect -> state assumptions -> plan files/checks -> smallest implementation -> relevant tests -> review diff/security/scope -> report files, behavior, verification, assumptions, risks. Scale ceremony to task; doc-only changes need no app build.
- Use BMAD for multi-file features, schema/contracts, checkout/auth/inventory/admin authorization, or work over ~1 day; otherwise skip. Roles: Analyst (problem/criteria), PM (short PRD), Architect (placement/decision), Scrum Master (stories via `docs/bmad/story-template.md`), Developer (Superpowers workflow), QA (`docs/bmad/qa-checklist.md`). Templates: `docs/bmad/`; create only needed artifacts.
- User is Product Owner. Main Codex owns requirements, planning, specialist selection, integration, validation, review, Git, delivery. Delegate only for concrete benefit; check/reuse suitable active agents. Max two concurrent subagents besides Main Codex; use `.codex/agents/` roles (Architect, Backend, Frontend, QA, Reviewer, DevOps) and Luna; choose effort by complexity. Assign exact ownership, avoid overlapping writes; delegates must not spawn agents or do Git operations. PR creation only when requested; merge/deploy need explicit authorization and quality/review/environment gates.
- Delegation does not authorize background monitoring, cron, hosted dispatchers/workers/queues, protected-path edits, or production operations. See `docs/CODEX_ORCHESTRATION.md` for packets, models, ownership, verification, handoff, delivery.

### Wiki maintenance

- `Wiki/` stores durable understanding; `AGENTS.md` agent rules; `docs/` human guides. Read `Wiki/index.md` before major changes and follow relevant links. Update Wiki for architecture, API contract, schema, or core business-rule changes.
- Use Obsidian `[[page-name]]` links with working backlinks; keep concise and do not copy source code. On Wiki edits, update `Wiki/index.md` Last updated and append one line to `Wiki/log.md`.
- Structure: `index.md` catalog/summary/date; `overview.md` purpose/stack/modules/commands/assumptions; `architecture.md` boundaries/risks; append-only `log.md`; `sources/`, `entities/`, `concepts/`, `decisions/` (one ADR each), `synthesis/`.

<!-- gitnexus:start -->
### GitNexus — mandatory code intelligence

Repo: `digital-e-shop` (64901 symbols, 82142 relationships, 530 flows). If stale, run `node .gitnexus/run.cjs analyze --index-only` at repo root. If runner absent, bootstrap with `npx`, `bunx`, or `pnpm dlx`, e.g. `bunx gitnexus@latest analyze` (npm 11 `npx` issue #1939).

- Before editing any function/class/method, run upstream impact via MCP `impact({target: "symbolName", direction: "upstream"})` or `node .gitnexus/run.cjs impact "symbolName" --direction upstream --repo .`; report callers, processes, risk. Never substitute grep. Warn on HIGH/CRITICAL; `riskSharedAxes` does not waive these warnings.
- Treat `risk: UNKNOWN` as unresolved, not low. Empty callers may mean unresolved dispatch/cross-language/property access; confirm with text search. Never infer unused/safe from zero. MCP File omits axes; Graph-RAG expands File.
- For read-only callers/dependencies/imports/flows, use graph first: `query({search_query: "concept"})`, `context({name: "symbolName"})`, or `impact`. Use text search only for empty/UNKNOWN/literals. Security taint: `explain({target: "fileOrSymbol"})` (requires `analyze --pdg`).
- Before commit, run MCP `detect_changes({scope: "all"})` or `node .gitnexus/run.cjs detect-changes --scope all --repo .`; `partial: true`/`truncated: true` is not clean, rerun. Regression: MCP `detect_changes({scope: "compare", base_ref: "main"})` or `node .gitnexus/run.cjs detect-changes --scope compare --base-ref "main" --repo .`.
- Never edit symbols before impact; ignore no HIGH/CRITICAL or UNKNOWN; never rename via find/replace (use GitNexus `rename`); never commit before graph change analysis.
- Resources: `gitnexus://repo/digital-e-shop/context`, `gitnexus://repo/digital-e-shop/clusters`, `gitnexus://repo/digital-e-shop/processes`, `gitnexus://repo/digital-e-shop/process/{name}`.
- CLI skills: architecture `.claude/skills/gitnexus-exploring/SKILL.md`; impact `.claude/skills/gitnexus-impact-analysis/SKILL.md`; debugging `.claude/skills/gitnexus-debugging/SKILL.md`; refactor `.claude/skills/gitnexus-refactoring/SKILL.md`; tools/resources `.claude/skills/gitnexus-guide/SKILL.md`; index/status/wiki `.claude/skills/gitnexus-cli/SKILL.md`.
<!-- gitnexus:end -->

### Known gaps

- `pnpm --dir server dev` prepares Prisma before compile/watch; client dev runs Vite. Each package has Vitest; server integration needs isolated MySQL.
- Prisma forward migrations exist; `0_init` is metadata-only because legacy SQL dump remains baseline. Lockfiles `client/pnpm-lock.yaml` and `server/pnpm-lock.yaml` are independent; update from owning package.
- `client/src/lib/env.ts` requires production API URL. Feature validators own schemas; shared parsing is `server/src/shared/validation/request-validation.ts`. Backend response keys vary; preserve route contracts.
