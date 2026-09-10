# Digital-E Wiki

This Wiki records durable Digital-E understanding for maintainers and AI agents. Use [AGENTS.md](../AGENTS.md) for repository rules and [docs/](../docs/) for task-oriented human guides.

**Project summary:** Digital-E is an electronics commerce platform built from two independent pnpm packages: a React 19 and Vite storefront/admin client in `client/`, and a NestJS 11 API on the Express 5 adapter in `server/`. MySQL remains the primary runtime database, while Prisma 7 owns a partial forward-migration layer.

**Last updated:** 2026-09-10

The current implementation includes authenticated and guest carts, server-authoritative checkout, Vietnam-first PayOS payment links with VND quote snapshots and verified webhooks, optional Stripe and local mock payment paths, verified-recipient Resend customer confirmations and account notices, order reservations and payment ledgers, catalog attributes and snapshots, customer support tickets, admin analytics, operational alerts, and database-backed demo verification.

The local demo seed creates a linked graph with 28 products across 8 categories and 16 brands. It verifies image URLs, order totals, reviews, wishlists, addresses, notifications, sessions, discounts, inventory movements, and orphan relationships. Normal seeding is guarded and non-destructive for demo-owned rows; full reset is an explicit local or protected production workflow.

## Start here

- [[overview]]: purpose, stack, package commands, environment, and current assumptions
- [[architecture]]: client, server, database, authentication, checkout, deployment, and CI boundaries
- [[authentication-and-email-verification]]: local/Firebase provider selection, server-owned verification, and verified-action gating
- [[marketing-subscriptions]]: opt-in, welcome email, one-time unsubscribe, and delivery boundaries
- [[guest-checkout]]: browser cart, authoritative preview, guest checkout, token-protected lookup, and cart merge
- [[order-lifecycle-and-support]]: order state transitions, review eligibility, and support-ticket ownership
- [[0001-mysql-primary-prisma-partial]]: MySQL and partial Prisma ownership
- [[0002-nestjs-migration]]: accepted NestJS migration and current server structure
- [[0003-payment-ledger-and-usd-canonical-currency]]: USD canonical amounts and provider settlement values
- [[0004-guest-cart-and-checkout]]: accepted guest access model and security boundary
- [[0005-vietnam-first-vnd-catalog-and-mock-payos]]: VND-first demo pricing and explicit local PayOS simulation
- [[log]]: append-only Wiki maintenance history

## Related guides

- [Root README](../README.md): setup and project overview
- [Architecture guide](../docs/ARCHITECTURE.md): current implementation boundaries
- [API guide](../docs/API.md): route groups and API conventions
- [Development guide](../docs/DEVELOPMENT.md): environment and local workflow
- [Testing guide](../docs/TESTING.md): package, integration, smoke, and k6 checks
- [CI/CD guide](../docs/ci-cd.md): CI, migration gates, deployment, and reset safety
- [Prisma workflow](../server/README.prisma.md): schema ownership and demo database operations

## Wiki catalog

### Entities

Domain objects and their relationships belong under `entities/`. Add a page when a domain object needs durable explanation, such as Product, Order, Cart, User, Discount, Review, Address, or Notification.

### Concepts

Cross-cutting behavior belongs under `concepts/`, such as authentication, validation, inventory movement, API response shapes, guest checkout, and order lifecycle.

### Decisions

Accepted architectural decisions belong under `decisions/`, one decision per file. Preserve historical context and add a current-status note when implementation changes.

### Sources and synthesis

Use `sources/` for notes derived from a specific source file or external reference. Use `synthesis/` for summaries that connect several Wiki pages.

## Maintenance rules

- Read this page before a major change and follow links into the relevant pages
- Update the affected Wiki page when architecture, API contracts, schema, or core business rules change
- Bump **Last updated** on this page and append one line to [[log]] for meaningful updates
- Use Obsidian wikilinks such as `[[page-name]]` for Wiki-to-Wiki links
- Keep completed plans and specs under `docs/superpowers/` as historical records; update maintained guides instead of rewriting past execution history
