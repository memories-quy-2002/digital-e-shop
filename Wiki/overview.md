# Overview

Back to [[index]].

## Purpose

Digital-E is a full-stack e-commerce system for selling electronic components and devices. It provides a customer storefront (catalog, cart, checkout, wishlist, order history, account/address book, notifications) and an admin dashboard (products, orders, accounts, promotions, inventory, analytics, notifications).

## Detected stack

| Area | Tools |
| --- | --- |
| Workspace | pnpm workspace (`pnpm@11.3.0`) — **pnpm only**, no npm/yarn |
| Frontend (`client/`) | React 19.2, React Router DOM 7, Vite 8, TypeScript (`strict: true`), SCSS/Sass, React Bootstrap, Axios, Firebase client auth, Recharts, Vitest (configured, no tests yet) |
| Backend (`server/`) | Node.js, Express 5.2, TypeScript (`strict: false`), MySQL (`mysql`/`mysql2`), Prisma 6 (partial), Zod, Passport + Google OAuth, `csrf-csrf`, `jsonwebtoken`, `express-rate-limit`, `multer`, Sharp, `@vercel/blob`, MongoDB client (one path), Pino logging |
| Deployment | Vercel (`client/vercel.json`, `server/vercel.json`), k6 read-only perf scripts |

## High-level modules

- **Frontend** — feature-scoped UI under `client/src/features/<domain>/` (admin, auth, orders, products, users); generic pages in `client/src/pages/`; shared infra in `client/src/lib`, `client/src/context`, `client/src/components`.
- **Backend** — feature-based API under `server/src/modules/<feature>/` following `routes → controller → service → repository`, plus shared `core`, `config`, `database`, `shared` layers.
- **Data** — primary runtime access is MySQL via feature repositories; Prisma is partially adopted for a limited subset of reads.

## Important commands

```powershell
pnpm install
pnpm dev                              # run both apps (root)
pnpm --filter server dev              # backend only
pnpm --filter client start            # frontend only (Vite)

# Verification
client\node_modules\.bin\tsc.cmd -p client\tsconfig.json --noEmit
pnpm --filter client build
pnpm --filter client lint
pnpm --filter server typecheck
pnpm --filter server build
pnpm --filter server lint

# Database / Prisma
pnpm --filter server prisma:generate
pnpm --filter server prisma:migrate
pnpm --filter server seed:mock
```

Local defaults: client `http://localhost:5173`, server `http://localhost:4000`, health `http://localhost:4000/api/health`.

## Current assumptions

- MySQL remains the dominant persistence layer; Prisma is **not** fully migrated to.
- Backend API response shapes are route-specific and inconsistent (`msg` vs `error` plus route data keys) — preserve per-route contracts.
- No committed `.env.example`; env vars are inferred (see [AGENTS.md](../AGENTS.md) → Environment variables).
- Client has Vitest configured but no committed test files; server has no unit/integration suite (only k6 read-only scripts).
- `client/src/lib/env.ts` currently hard-codes the API base URL rather than reading from env.
