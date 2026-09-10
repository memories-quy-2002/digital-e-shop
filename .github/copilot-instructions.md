# Copilot instructions for Digital-E

Read [AGENTS.md](../AGENTS.md) first. It is the source of truth for project rules. Use [Wiki/index.md](../Wiki/index.md) and the maintained guides under [docs/](../docs/) for current architecture and workflow details.

## Project overview

Digital-E is an electronics commerce platform with two independent pnpm packages:

- `client/`: React 19, Vite 8, TypeScript, Tailwind CSS, Radix UI, and SCSS
- `server/`: NestJS 11 on the Express 5 adapter, TypeScript, MySQL, and partial Prisma ownership

Use Node.js `24.20.0` and pnpm `12.3.4`. The package-local lockfiles and workspace policies are independent. The applications deploy separately to Vercel, and GitHub Actions validates both packages.

## Setup and commands

```powershell
pnpm --dir client install
pnpm --dir server install

pnpm --dir server dev
pnpm --dir client dev

pnpm --dir client exec tsc -p tsconfig.json --noEmit
pnpm --dir client lint
pnpm --dir client test -- --run
pnpm --dir client build

pnpm --dir server typecheck
pnpm --dir server lint
pnpm --dir server test -- --run
pnpm --dir server build
```

Use the isolated Docker MySQL database for database-backed checks:

```powershell
pnpm --dir server docker:setup
pnpm --dir server test:integration
pnpm --dir server demo:verify
```

## Coding boundaries

- Put domain client code under `client/src/features/<domain>/`
- Reuse `client/src/lib/http.ts`, feature API modules, contexts, and existing UI primitives
- Put backend features under `server/src/<feature>/`
- Keep Nest controllers focused on request parsing and response formatting
- Keep business rules and cross-table coordination in services
- Keep parameterized SQL and Prisma persistence in repositories
- Validate writes with Zod before persistence
- Preserve route-local response keys, cookie sessions, CSRF behavior, route aliases, and current auth contracts

## Security-sensitive areas

- `AuthGuard`, `RolesGuard`, and `OwnerParam` enforce session, role, and ownership boundaries
- Unsafe requests use the existing CSRF middleware; login, registration, and refresh keep their explicit exclusions
- Production authentication verifies Firebase identity before issuing the server's cookie-backed session
- Refresh sessions are hashed, rotated, revocable, and checked against the active user
- Guest checkout stores only product IDs and quantities in the client cart; the database stores only a hash of the raw guest token
- All SQL must be parameterized; do not add string-built queries or unsafe raw SQL without review
- Do not log passwords, tokens, cookies, secrets, or unnecessary personal data
- Do not commit credentials, `.env` files, database dumps, or private keys
- Preserve database-target guards, migration safety, rate limits, and webhook idempotency

## What reviewers should verify

- Customer routes enforce ownership, and admin routes enforce the `admin` role before business logic
- Checkout, inventory, payment, timeline, notification, support, and guest lookup changes preserve transaction and idempotency boundaries
- API responses retain their existing `msg`, `error`, and route-specific data keys unless the contract change is explicit
- UI changes retain loading, empty, error, success, responsive, keyboard, and focus states
- Tests and documentation match the changed behavior

## Git workflow

The remote has one long-lived branch, `main`. Branch new work as `feature/`, `bugfix/`, or `hotfix/` and merge through a pull request. Never push directly to `main`.
