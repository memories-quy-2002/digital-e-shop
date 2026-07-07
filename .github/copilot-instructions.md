# Copilot Instructions — digital-e-shop

Full project rules live in [AGENTS.md](../AGENTS.md) — read it first. This file is a
short summary for Copilot code review / chat; if the two ever disagree, `AGENTS.md` wins.

## Project overview
E-commerce website selling electronic devices and components. pnpm workspace with two packages:
- `client/` — React 19 + Vite + TypeScript (strict) + SCSS frontend
- `server/` — Express 5 backend, MySQL primary data store, partial Prisma adoption, JWT + Google OAuth auth

Database: MySQL, hosted on Aiven. Package manager: **pnpm only** — never add npm/yarn lockfiles. Deployment: Vercel. CI/CD: GitHub Actions.

## Setup & commands
- Install dependencies: `pnpm install`
- Run both dev servers: `pnpm dev` (root)
- Run client dev server: `pnpm --filter client start`
- Run server dev: `pnpm --filter server dev`
- Typecheck client: `pnpm --filter client exec tsc --noEmit`
- Typecheck server: `pnpm --filter server typecheck`
- Build client: `pnpm --filter client build`
- Build server: `pnpm --filter server build`
- Lint: `pnpm --filter client lint` / `pnpm --filter server lint`
- Tests: `pnpm --filter client test` (Vitest configured; no test files committed yet)

## Coding conventions
- Use TypeScript strictly on the client — avoid `any`, prefer explicit types/interfaces. Server TS is looser (`strict: false`); match the existing local style in touched files rather than tightening repo-wide.
- Follow existing SCSS module/BEM structure for styling; don't introduce a new CSS-in-JS approach.
- Keep API route handlers thin — request parsing/response formatting only. Push business rules into services and table access into repositories (`routes -> controller -> service -> repository`).
- Match existing file/folder naming conventions already used in `client/src` and `server/src` rather than introducing new patterns.
- Preserve existing API response shapes (`msg`, `error`, route-specific data keys) — don't "clean up" a contract unless explicitly asked.

## Security-sensitive areas — flag issues here first
- **JWT auth**: token generation, expiry, and refresh logic. Watch for missing expiry checks, weak secrets, or tokens leaking into logs/responses.
- **CSRF**: unsafe requests must keep the existing CSRF flow. Login/register/refresh are intentionally exempt — flag any change that broadens that exemption.
- **Database queries**: all MySQL queries must be parameterized. Flag any string-concatenated or template-literal SQL, and review any `$queryRawUnsafe` usage carefully.
- **Input validation**: flag any API route accepting user input (especially checkout/order/payment-adjacent routes) that lacks Zod validation before persistence.
- **AuthZ**: customer endpoints must check ownership; admin endpoints must enforce `requireAdmin` before business logic. Flag any bypass of `requireAuth`, `requireAdmin`, or `requireOwnerOrAdmin`.
- **Secrets**: flag any hardcoded API keys, DB credentials, or JWT secrets committed directly in code.
- **CORS config**: this project has had prior CORS/routing issues on Vercel — flag changes to CORS/middleware config that look overly permissive (e.g. wildcard origins) or that could break existing client-server routing.

## What NOT to flag
- Minor SCSS style preferences that don't affect functionality.
- Formatting-only differences already handled by existing lint/format tooling.
- Missing tests in areas that have no test harness today (see AGENTS.md "Testing instructions") — suggest adding one instead of blocking on it.

## Git workflow
The GitHub remote currently has a single long-lived branch: `main` (also serving as the deployed/production branch). A `dev` → `main` → `production` flow ran previously but those branches were merged and deleted — don't assume `dev` or `production` exist; verify with the remote if unsure. Branch new work (`feature/`, `bugfix/`, `hotfix/`) from `main` and PR back into it. Never push directly to `main`.

## Notes for reviewers (human or Copilot)
- This is a solo-maintained personal/portfolio project — prioritize correctness, security, and clarity over enterprise-scale patterns (e.g. don't suggest full microservices restructuring).
- Do not add dependencies without a concrete need; keep lockfile churn minimal and prefer patch/minor updates unless a larger change is explicitly requested.
