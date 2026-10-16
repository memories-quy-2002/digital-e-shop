# Admin Operations Implementation Plan

**Goal:** Make Digital-E admin workflows reliable and responsive as catalog, orders, customers, and alerts grow.

**Architecture:** Keep current feature boundaries. Add validated server-side filters and pagination to admin list APIs, use aggregate analytics for dashboard metrics, and persist operational acknowledgements and sensitive admin changes through existing MySQL transaction patterns.

**Tech Stack:** React 19, TypeScript, NestJS 11, Zod, mysql2, Prisma forward migrations, Vitest.

**Spec:** User-approved admin recommendations in the preceding conversation.

## Global Constraints

- Preserve route aliases, existing response keys, AuthGuard, RolesGuard, CSRF, and database ownership boundaries.
- MySQL remains the runtime persistence path; schema additions are additive forward migrations and matching Prisma models.
- Do not fetch unbounded admin datasets for client-side filtering or on a 30-second dashboard timer.
- Preserve order/payment/fulfillment lifecycle rules and report actionable errors.
- Keep customer PII out of audit metadata; require a reason for privilege and stock changes.

## Review Focus

- Search text containing SQL wildcard or quote characters remains parameterized and bounded.
- Empty pages, filters that reduce page count, and failed refreshes preserve a clear state.
- Concurrent admin role changes cannot suspend or demote the last active admin.
- A resolved alert or a new inventory alert does not inherit an unrelated prior alert state.
- Promotion timestamps round-trip in the admin's local timezone while storage and checkout compare UTC instants.

## Tasks

1. Add tested, bounded server-side admin filters and pagination for orders, products, and accounts; migrate their tables from fetch-all/local filtering.
2. Refactor the dashboard to use aggregate analytics, bounded recent records, and an oldest-pending queue; poll only the lightweight summary and alerts. Surface order transition conflicts.
3. Require reason/reference for stock changes; add account-change confirmation and server-side self/last-admin protections; record sensitive changes in an admin audit log.
4. Add promotion usage/remaining counts, explicit local-time conversion, and a cart-value preview; record promotion changes in the audit log.
5. Persist admin alert acknowledgement/ownership/resolution state and expose the state through the existing dashboard/header workflows.
6. Update API/Wiki documentation and run targeted tests, complete client/server suites, builds, typechecks, and lint without starting either dev server.
