# Development Guide

## Runtime Versions

Use Node.js `24.20.0` and pnpm `12.3.4`. The repository pins the Node version
in `.node-version`; both package manifests pin the pnpm version.

## Install

Install each application independently:

```powershell
pnpm --dir client install
pnpm --dir server install
```

`client/pnpm-lock.yaml` and `server/pnpm-lock.yaml` are independent. The root
directory intentionally has no `package.json`, pnpm workspace, lockfile, or
`node_modules`.

## Run Locally

Run each app in its own terminal:

```powershell
pnpm --dir server dev
pnpm --dir client dev
```

Before the server starts, its lifecycle runs `prisma:generate` followed by
`prisma migrate deploy`, then compiles and starts the localhost watcher. The
same Prisma preparation and compile step runs before `pnpm --dir server start`.

Default URLs:

- Client: `http://localhost:5173`
- Server: `http://localhost:4000`
- Health: `http://localhost:4000/api/health`

## Environment

The server needs a configured `server/.env` for database, auth, CORS, and
deployment-specific values. In production, `DATABASE_URL`, `DB_HOST`,
`DB_USER`, `DB_NAME`, `JWT_SECRET_KEY`, `JWT_REFRESH_SECRET_KEY`,
`CSRF_SECRET`, `CLIENT_URL`, and `SERVER_URL` are required; startup fails
clearly when any are missing. Do not commit `.env` files.

The server loads `server/.env.<mode>.local`, `server/.env.local`,
`server/.env.<mode>`, and finally `server/.env` in that order. Use
`server/.env.docker` for the local Docker database helpers; it points to the
same `127.0.0.1:3307` MySQL mapping and local API origins.

The client should use the existing API configuration pattern instead of hard
coding environment-specific URLs inside page components. Development defaults
to `http://localhost:4000`; production builds require `VITE_API_BASE_URL` to be
set explicitly. Vite reads the local fallback from `client/.env` and allows
`client/.env.local` or mode-specific files to override it. The client Vercel
project must provide the production API URL externally.

## Frontend Guidelines

- Keep page components focused on rendering and user interaction.
- Reuse context and API helpers for shared state and network behavior.
- Keep responsive layout checks in mind for header, footer, admin tables,
  filters, product cards, checkout, and cart flows.
- Prefer clear loading, empty, error, and success states for data-driven pages.

## Backend Guidelines

- Routes define HTTP shape.
- Controllers parse request data and return responses.
- Services hold business rules.
- Models hold SQL and schema-specific behavior.

Avoid direct SQL in controllers. If a feature touches multiple tables, keep the
orchestration in a service.

## Database Guidelines

- Use `discounts` for promotion data.
- Use `carts` for cart data.
- Derive product ratings from `reviews`.
- Prefer soft deletes for products.
- Record inventory movements whenever stock changes.

## Pull Requests

Use small, reviewable commits with Conventional Commit messages. Include:

- Summary of user-facing changes.
- Backend or schema assumptions.
- Verification commands and results.
- Screenshots for substantial UI changes when possible.
