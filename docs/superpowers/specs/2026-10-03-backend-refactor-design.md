# Backend refactor design

Date: 2026-10-03
Status: design approved by the user on 2026-10-03; Batch A and Batch B Task 1 implemented; remaining work is pending

## Goal

Address the six source-grounded backend audit items through small,
behavior-preserving changes. Improve persistence boundaries and test coverage
before optimizing query execution. Keep the existing feature-based NestJS
architecture, raw MySQL ownership, and public API contracts.

## Current evidence

- `orders.service.ts` contains 1,338 lines and SQL for payment ledger writes,
  cancellation, PayOS finalization, and status transitions.
- `products.service.ts` imports the MySQL pool and implements transactional
  product/category/brand SQL itself.
- `CartRepository` exposes callbacks that `NestCartService` repeatedly wraps
  in promises, including nested callbacks for adding and updating items.
- Shared `purchaseSchema` lacks `discountCode`; the feature schema includes it.
  The shared test currently exercises the duplicate rather than the route schema.
- Analytics issues ten queries concurrently against a ten-connection pool.
- Filtered product count uses the rating/reservation joins even though its
  WHERE conditions do not depend on those aggregates.
- The unpaginated product endpoint returns all products; existing paginated
  frontend callers do not establish permission to change this API contract.
- Cancellation reads and updates each product separately inside the transaction.

The previous audit's package-local typecheck and lint passed. Its focused
suite passed 27 files / 120 tests. These results are a baseline, not evidence
that the proposed refactor passes. MySQL at 127.0.0.1:3307 was unavailable.

## Invariants

- Preserve routes, aliases, payload keys, HTTP statuses, error messages,
  ordering, pagination semantics, and the unpaginated product response.
- Preserve guards, ownership, CSRF, cookie flow, and Firebase verification.
- Preserve authoritative checkout prices and stock, COD/PayOS behavior,
  historical currency compatibility, idempotency, and guest-token privacy.
- All participating repository methods receive the caller's TransactionContext;
  never substitute pool.query inside a transaction or open a nested transaction.
- Preserve inventory movements, alert events, and timeline writes in their
  existing business transaction; notifications retain their after-commit timing.
- No new dependencies, schema changes, production operations, commits, or pushes.

## Chosen approach and alternatives

Use incremental feature-local extraction and Promise-returning repository
methods. This preserves the existing architecture and lets each batch be
verified independently. A generic repository framework would add indirection
without solving an additional boundary problem. A full persistence/Prisma
migration would expand the scope and transaction risk unnecessarily.

## Batch A: validation and cart asynchronous boundaries

1. Retain parse/error-formatting helpers in shared validation. Replace duplicate
   feature schemas with compatibility re-exports from their owning validators,
   after checking import cycles. Move relevant tests to the actual feature
   schemas. Test that discountCode survives checkout validation.
2. Convert CartRepository callback methods to typed Promise results; preserve
   SQL, parameters, mutation order, empty arrays, and affectedRows checks.
3. Update all production callers and test doubles together. Retain explicit
   adapters for neighboring callback APIs when their conversion would require
   expanding this batch. Do not silently broaden this into all repositories.

Proposed source scope:

- server/src/shared/validation/request-schemas.ts
- server/src/shared/validation/request-schemas.test.ts
- server/src/cart/cart.repository.ts (high)
- server/src/cart/cart.service.ts
- server/src/cart/__tests__/cart.repository.test.ts
- server/src/cart/__tests__/cart.service.test.ts
- server/src/cart/__tests__/cart.stock.service.test.ts
- server/src/cart/__tests__/cart.not-found.service.test.ts
- server/src/cart/__tests__/guest-cart-preview.test.ts

Acceptance: existing cart behavior remains equivalent; empty/removed products,
stock conflict, ownership-sensitive deletion/update, and DB rejection propagate
correctly; checkout tests exercise the owning schema.

## Batch B: product and order persistence boundaries

1. Move transactional product CRUD, row locks, and category/brand resolution
   into ProductsRepository methods accepting TransactionContext. ProductsService
   keeps normalization and inventory/attribute/alert orchestration.
2. Move remaining order SQL into transaction-aware OrdersRepository methods.
   Separate pure snapshot mapping into a feature-local helper and cancellation
   into a focused service. Keep the existing public NestOrdersService facade.
3. Adapt Nest registration and tests without optional fallbacks that silently
   bypass required persistence behavior.
4. Treat any additional service extraction as a separate bounded batch when
   moving more code would exceed the policy's file/line budget.

Proposed source scope (all orders paths and repositories are high):

- server/src/products/products.service.ts
- server/src/products/products.repository.ts
- server/src/products/products.types.ts
- server/src/products/__tests__/products.alerts.test.ts
- server/src/products/__tests__/products.repository.test.ts (new)
- server/src/orders/orders.service.ts
- server/src/orders/orders.repository.ts
- server/src/orders/orders.types.ts
- server/src/orders/orders.module.ts
- server/src/orders/orders.snapshot.ts (new)
- server/src/orders/orders-cancellation.service.ts (new)
- server/src/orders/__tests__/orders.repository.test.ts
- server/src/orders/__tests__/orders.lifecycle.test.ts
- server/src/orders/__tests__/orders.alerts.test.ts
- server/src/orders/__tests__/orders.payos.finalization.test.ts
- server/src/orders/__tests__/guest-purchase.test.ts
- server/src/orders/__tests__/orders.integration.test.ts

Acceptance: services contain no SQL for the extracted operations; lock/write
ordering, commit/rollback, ledger fields, snapshots, inventory history,
idempotent finalization, and notification timing remain equivalent.

## Batch C: query work and cancellation round trips

1. Split product count's FROM/JOIN fragment from the projection joins. Retain
   category/brand joins and attribute EXISTS filters. Do not change listing
   response size or introduce default pagination in this refactor.
2. Coalesce simultaneous analytics requests for the same validated range while
   they are in flight. Evict on success and failure. Do not cache completed
   results or introduce a staleness window without a separate product decision.
   Note: this helps overlapping identical requests, not distinct ranges or
   requests reaching different server instances.
3. Consider bulk cancellation product locking only after the extraction batch
   passes. Preserve sorted lock order, duplicate product-item behavior, per-write
   affectedRows checks, and transactional alerts/movements. Do not replace safe
   conditional writes with unchecked bulk mutations.

Proposed source scope:

- server/src/products/products.repository.ts (high)
- server/src/products/__tests__/products.repository.test.ts
- server/src/products/__tests__/products.controller.test.ts
- server/src/analytics/analytics.service.ts
- server/src/analytics/__tests__/analytics.service.test.ts
- server/src/orders/orders-cancellation.service.ts (high)
- server/src/orders/orders.repository.ts (high)
- server/src/orders/__tests__/orders.lifecycle.test.ts (high)
- server/src/orders/__tests__/orders.integration.test.ts (high)

Acceptance: counts match existing filtered listing; concurrent identical
analytics work is shared and retries after rejection work; cancellation
restores each quantity once and rolls back every related write on failure.
Any speed improvement remains unverified until measured on an isolated MySQL DB.

## Verification and delivery

- Establish fresh focused baselines before each batch; add characterization
  and regression tests for the moved boundaries.
- Run server typecheck, lint, relevant unit suites, and build after changes.
  Use existing package-local binaries if pnpm fails with NO_TTY; report actual
  Node/pnpm version deviations and do not reinstall dependencies implicitly.
- Run MySQL integration only against an independently verified isolated target.
  Never load or mutate a production DB to establish performance evidence.
- Obtain EXPLAIN/query counts and representative latency measurements before
  claiming a measured speedup. Missing DB evidence remains an explicit limit.
- Update Wiki/architecture.md, Wiki/index.md, and Wiki/log.md alongside durable
  boundary changes. Their proposed paths are low risk.
- Each execution batch respects stop-conditions.yml: at most 25 files and
  1,000 changed lines, with bounded retries. If a batch exceeds a bound, stop
  and split/review it; do not change policy to accommodate the refactor.

## Approval and outstanding decisions

The user authorized the audit findings' refactor in principle. This document
provides the concrete design and proposed exact path scopes for review.
The user approved this written design on 2026-10-03. Implementation-plan
review and execution-method selection remain pending.

AGENTS.md and canonical risk policy require approval for the high paths above.
Caller-created approval records cannot replace trusted approval. Implementation
must not proceed through a guarded loop/repair session without its required
trusted host approval. Critical paths/actions are excluded entirely.

The brainstorming workflow requires review of this written design before an
implementation plan, followed by review of that plan. Recommended execution:
native implementation in this chat, one independently verified batch at a time.
Keep public pagination behavior and completed analytics-result freshness intact.
