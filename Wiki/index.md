# Digital-E Wiki

The long-term knowledge base for the Digital-E e-commerce system. Readable in Obsidian; maintained by humans and AI agents. For agent rules, see [AGENTS.md](../AGENTS.md). For human guides, see [docs/](../docs/).

**Project summary:** Digital-E is a full-stack e-commerce platform for electronic components and devices, built as two independent pnpm packages: a React 19 + Vite storefront/admin (`client/`) and a NestJS + TypeScript API (`server/`, migrated from Express 5 — see [[0002-nestjs-migration]]) backed primarily by MySQL with a partial Prisma layer.

**Last updated:** 2026-09-08

The local MySQL demo seed creates and verifies a linked multi-table graph with
28 catalog products, each using a unique HTTPS stock image URL. The seed stays
non-destructive for normal reruns; Docker reset is an explicit local-only
operation.

Checkout follows the dark technical storefront language with a progress rail,
scoped payment/shipping panels, and normalized client-side email validation.
Transient Toasts use a portal-mounted viewport outside the app shell, while
contextual validation stays next to the action that needs attention.

## Core pages

- [CI/CD guide](../docs/ci-cd.md) — validation workflows, migration gates, deployment checks, and rollback.

- [[overview]] — purpose, stack, modules, commands, assumptions.
- [[architecture]] — folder structure, frontend/backend/database boundaries, risks.
- [[log]] — append-only wiki/AI-maintenance change log.
- [[0003-payment-ledger-and-usd-canonical-currency]] — payment providers, USD canonical amounts, and PayOS VND quotes.
- [[order-lifecycle-and-support]] — cancellation, review eligibility, and support-ticket rules.

## Catalog

### Entities (`entities/`)
Domain objects and their relationships. Add a page per entity as it is documented (e.g. `Product`, `Order`, `Cart`, `User`, `Discount`, `Review`, `Address`, `Notification`).

### Concepts (`concepts/`)
Cross-cutting concepts (e.g. `auth-and-csrf`, `validation`, `inventory-movement`, `api-response-shapes`).

### Decisions (`decisions/`)
Lightweight ADRs — one decision per file. See [[0001-mysql-primary-prisma-partial]], [[0002-nestjs-migration]].

### Sources (`sources/`)
Notes distilled from specific source files or external docs.

### Synthesis (`synthesis/`)
Higher-level summaries tying several pages together.

## How to use this wiki

- Read this page before any major change, then follow links into the relevant pages.
- After meaningful architecture / API / database / business-logic changes, update the affected page, bump **Last updated** above, and append a line to [[log]].
- Link pages with Obsidian wikilinks: `[[page-name]]` (no `.md`).
