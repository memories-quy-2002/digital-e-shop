# Development Guide

## Install

Install dependencies from the repository root:

```powershell
pnpm install
```

The root lockfile resolves both `client` and `server`.

## Run Locally

Run both apps:

```powershell
pnpm dev
```

Run one package:

```powershell
pnpm --filter client start
pnpm --filter server dev
```

Default URLs:

- Client: `http://localhost:5173`
- Server: `http://localhost:4000`
- Health: `http://localhost:4000/api/health`

## Environment

The server needs a configured `server/.env` for database, auth, CORS, and
deployment-specific values. Do not commit `.env` files.

The client should use the existing API configuration pattern instead of hard
coding environment-specific URLs inside page components.

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
