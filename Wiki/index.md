# Digital-E Wiki

This Wiki records durable Digital-E understanding for maintainers and AI agents. Use [AGENTS.md](../AGENTS.md) for repository rules and [docs/](../docs/) for task-oriented human guides.

**Project summary:** Digital-E is an electronics commerce platform with independent React/Vite and NestJS packages. MySQL is the primary runtime database; Prisma provides a partial typed projection and migration layer. Firebase is the only auth provider. Fulfillment uses internal routes and scheduled staff assignments without GPS tracking.

**Last updated:** 2026-11-15

Current capabilities cover guest/authenticated checkout, PayOS/COD in VND, inventory reservations, internal delivery, after-sales, transactional email, loyalty, support, catalog, admin operations, and observability. See [[overview]], [[commerce-journey]], [[vnd-payment-operations]], and the domain pages below. Historical GHN records remain read-only and do not trigger provider calls or delivery changes.

Demo seed baseline: 120 products, 8 categories, 16 brands, and four accounts with at least 25 orders each. Verification checks seeded counts and relationships; runtime logins may add sessions without invalidating it. Local seeds use Auth Emulator UIDs. Production reset resolves existing Firebase identities before changing MySQL. Normal seeding is guarded and non-destructive; full reset is local or protected. See [[overview]] and [the development guide](../docs/DEVELOPMENT.md).

## Start here

- [[overview]]: purpose, stack, package commands, environment, and current assumptions
- [[architecture]]: client, server, database, authentication, checkout, deployment, and CI boundaries
- [[authentication-and-email-verification]]: Firebase-only identity, Firebase-owned verification, and verified-action gating
- Marketing subscriptions and unsubscribe routes are removed; the historical schema remains only for migration compatibility.
- [[guest-checkout]]: local/server anonymous cart persistence, authoritative preview, guest checkout, token-protected lookup, aggregate funnel analytics, and cart merge
- [[order-lifecycle-and-support]]: order state transitions, review eligibility, and support-ticket ownership
- [[after-sales-request]]: customer and guest return/warranty requests, eligibility, status events, and refund boundaries
- [[payos-checkout-reliability]]: persistent PayOS attempts, verified status recovery, cancellation, and admin exception handling
- [[0001-mysql-primary-prisma-partial]]: MySQL and partial Prisma ownership
- [[0002-nestjs-migration]]: accepted NestJS migration and current server structure
- [[0003-payment-ledger-and-usd-canonical-currency]]: archived USD-canonical decision; current checkout is PayOS/COD in VND
- [[0004-guest-cart-and-checkout]]: accepted guest access model and security boundary
- [[0005-vietnam-first-vnd-catalog-and-mock-payos]]: VND-first demo pricing and explicit local PayOS simulation
- [[0006-customer-account-routes-and-localization]]: canonical customer account routes and bilingual storefront localization
- [[log]]: append-only Wiki maintenance history

## Related guides

- [[0007-public-resource-identifiers]]: UUID v7 public references for orders, support, and after-sales, with numeric key compatibility

- [Root README](../README.md): setup and project overview
- [Architecture guide](../docs/ARCHITECTURE.md): current implementation boundaries
- [Codex orchestration](../docs/CODEX_ORCHESTRATION.md): on-demand specialist roles, task-specific reasoning, two-subagent limit, and delivery ownership
- [API guide](../docs/API.md): route groups and API conventions
- [Development guide](../docs/DEVELOPMENT.md): environment and local workflow
- [Testing guide](../docs/TESTING.md): package, integration, smoke, and k6 checks
- [CI/CD guide](../docs/ci-cd.md): CI, migration gates, deployment, and reset safety
- [Prisma workflow](../server/README.prisma.md): schema ownership and demo database operations
- [Database concurrency and performance](../docs/DATABASE_CONCURRENCY_PERFORMANCE.md): safe retry boundaries, row-lock ordering, scoped catalog aggregates, query profiling and rollout

## Wiki catalog

### Entities

Domain objects and their relationships belong under `entities/`. Current pages cover:

- [[product]]: catalog identity, pricing, inventory, and historical snapshots
- [[supplier-and-procurement]]: supplier identity, purchase-order snapshots, partial receiving, and receipt costs
- [[order]]: customer and guest identity, lifecycle, order items, and reporting
- [[payment]]: payment ledger, provider boundary, webhooks, and reconciliation
- [[support-ticket]]: support ownership and the current after-sales boundary
- [[after-sales-request]]: after-sales request ownership, guest capability access, and payment-ledger refund state
- [[product-alert]]: authenticated price-drop/back-in-stock subscriptions, durable transition events, and customer notifications

### Concepts

- [[admin-operations]]: bounded admin lists, aggregate dashboard polling, transactional audit events, and persisted alert triage.
- [[durable-operations]]: transactional task persistence, bounded leases and fencing.
- [[shipping-and-fulfillment]]: internal route-priced checkout quotes, immutable delivery snapshots, scheduled staff assignments, and the read-only legacy shipment boundary.
- [[transactional-email-operations]]: immutable business events, durable delivery attempts, provider webhooks and operator recovery.

Cross-cutting behavior belongs under `concepts/`, such as authentication, validation, inventory movement, [[api-response-contract]], guest checkout, and order lifecycle.

- [[api-response-contract]]: canonical success/error metadata, compatibility aliases, request IDs, and pagination boundaries
- [[loyalty-rewards]]: point earning/redemption rules, owner-bound vouchers, and checkout/payment integration
- [[procurement-and-stock-counts]]: source-linked receipts, revision-based stock safety, active checkout holds, and audited count approval

### Decisions

Accepted architectural decisions belong under `decisions/`, one decision per file. Preserve historical context and add a current-status note when implementation changes.

- [[0007-internal-delivery-only]]: internal delivery is the only active fulfillment integration; historical GHN records remain read-only


### Sources and synthesis

Use `sources/` for notes derived from a specific source file or external reference. Use `synthesis/` for summaries that connect several Wiki pages.

Current source notes:

- [[checkout-and-payment-runtime]]: source map for cart, checkout, payment, and reconciliation
- [[production-environment]]: production client/server variables, secret boundaries, and startup validation
- [[support-and-after-sales-runtime]]: source map for support tickets and the implemented after-sales workflow

Current synthesis pages:

- [[commerce-journey]]: end-to-end catalog, cart, checkout, order, payment, and support flow, including the storefront path and its recovery points
- [[vnd-payment-operations]]: VND provider, finalization, reconciliation, and recovery model

## Maintenance rules

- Read this page before a major change and follow links into the relevant pages
- Update the affected Wiki page when architecture, API contracts, schema, or core business rules change
- Bump **Last updated** on this page and append one line to [[log]] for meaningful updates
- Use Obsidian wikilinks such as `[[page-name]]` for Wiki-to-Wiki links
- Keep completed plans and specs under `docs/superpowers/` as historical records; update maintained guides instead of rewriting past execution history
