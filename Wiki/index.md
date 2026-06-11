# Digital-E Wiki

The long-term knowledge base for the Digital-E e-commerce system. Readable in Obsidian; maintained by humans and AI agents. For agent rules, see [AGENTS.md](../AGENTS.md). For human guides, see [docs/](../docs/).

**Project summary:** Digital-E is a full-stack e-commerce platform for electronic components and devices, built as a pnpm workspace with a React 19 + Vite storefront/admin (`client/`) and an Express 5 + TypeScript API (`server/`) backed primarily by MySQL with a partial Prisma layer.

**Last updated:** 2026-06-11

## Core pages

- [[overview]] — purpose, stack, modules, commands, assumptions.
- [[architecture]] — folder structure, frontend/backend/database boundaries, risks.
- [[log]] — append-only wiki/AI-maintenance change log.

## Catalog

### Entities (`entities/`)
Domain objects and their relationships. Add a page per entity as it is documented (e.g. `Product`, `Order`, `Cart`, `User`, `Discount`, `Review`, `Address`, `Notification`).

### Concepts (`concepts/`)
Cross-cutting concepts (e.g. `auth-and-csrf`, `validation`, `inventory-movement`, `api-response-shapes`).

### Decisions (`decisions/`)
Lightweight ADRs — one decision per file. See [[0001-mysql-primary-prisma-partial]].

### Sources (`sources/`)
Notes distilled from specific source files or external docs.

### Synthesis (`synthesis/`)
Higher-level summaries tying several pages together.

## How to use this wiki

- Read this page before any major change, then follow links into the relevant pages.
- After meaningful architecture / API / database / business-logic changes, update the affected page, bump **Last updated** above, and append a line to [[log]].
- Link pages with Obsidian wikilinks: `[[page-name]]` (no `.md`).
