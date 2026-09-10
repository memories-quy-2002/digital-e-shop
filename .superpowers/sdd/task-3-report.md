# Task 3 Report: Transactional Guest Purchase and Token-Protected Lookup

## Status

DONE_WITH_CONCERNS

Commit: `b98cd0b` — `feat(server): support transactional guest purchase`

## Scope completed

- Added typed guest purchase, contact, shipping, payment-method, and lookup DTOs.
- Added strict Zod validation for guest cart product/quantity pairs, structured contact and shipping fields, supported cash/bank-transfer/PayOS methods, bounded duplicate quantities, and token-protected lookup input.
- Added `POST /api/orders/guest/purchase` without authentication guards. The endpoint accepts only product IDs/quantities, contact, shipping, optional discount code, and payment method; it rejects trusted user IDs, prices, totals, and discount amounts.
- Reused the Task 2 authoritative guest cart preview for current product data, prices, stock, and promotion state, then reused the shared transactional order creation path.
- Generalized the shared order transaction around the existing authenticated/guest `OrderIdentity` foundation. Guest orders persist `user_id = NULL`, normalized contact snapshot fields, the shipping snapshot in the existing `shipping_address` field, and only the SHA-256 hash of a cryptographically generated raw token.
- Preserved existing cash, bank-transfer, and PayOS payment ledger behavior. PayOS continues to use the configured USD-to-VND quote path.
- Guest orders skip cart completion writes and customer notifications. Authenticated order notification and ownership behavior remains intact; nullable identities also no longer trigger notification repository writes in shared order lifecycle/finalization paths.
- Added `POST /api/orders/guest/lookup`. It requires both numeric order ID and raw token, filters the repository lookup to `user_id IS NULL`, performs server-side constant-time token comparison, and returns a whitelisted guest-safe DTO without user IDs, token hashes, order-item internal IDs, or arbitrary private fields.
- Admin order projections now display guest name/email snapshots when present.

## Files changed in commit

- `server/src/notifications/notifications.service.ts`
- `server/src/orders/__tests__/guest-purchase.test.ts`
- `server/src/orders/__tests__/orders.repository.test.ts`
- `server/src/orders/orders.controller.ts`
- `server/src/orders/orders.dto.ts`
- `server/src/orders/orders.repository.ts`
- `server/src/orders/orders.service.ts`
- `server/src/orders/orders.types.ts`
- `server/src/orders/orders.validator.ts`

The existing Task 1/2 changes in checkout reservation and promotion foundations already supplied nullable identity/token-hash support, so those files were not changed in this commit.

## TDD evidence

Initial RED command:

```text
pnpm --dir server exec vitest run src/orders/__tests__/guest-purchase.test.ts --reporter=verbose
```

Observed 10 failures because the guest schemas, controller methods, and service methods did not yet exist. The failures were feature-missing failures, not infrastructure failures.

Final focused test coverage includes:

- strict rejection of trusted prices, totals, discounts, user IDs, unsupported payment methods, malformed quantities, and excessive duplicate quantities;
- contact/shipping validation and phone normalization;
- successful cash, bank-transfer, and PayOS transaction creation;
- PayOS VND amount/currency/fx behavior;
- nullable user ID, contact snapshot, token hash, order items, inventory movement, and notification suppression;
- server-derived promotion redemption and invalid-coupon rejection;
- stock race failure after order insertion, with transaction rejection/no successful order result;
- lookup rejection for wrong token and safe DTO output for the correct token;
- parameterized guest identity lookup SQL.

## Verification commands and results

| Command | Result |
| --- | --- |
| `pnpm --dir server exec vitest run src/orders/__tests__/guest-purchase.test.ts --reporter=verbose` (initial RED) | Failed as expected: 10 feature-missing failures |
| `pnpm --dir server exec vitest run src/orders/__tests__/guest-purchase.test.ts src/orders/__tests__/orders.repository.test.ts src/orders/__tests__/orders.lifecycle.test.ts src/orders/__tests__/orders.reservation-finalization.test.ts src/orders/__tests__/checkout-reservation.service.test.ts src/promotions/__tests__/promotions.service.test.ts src/notifications/__tests__/notifications.controller.test.ts --reporter=verbose` | Passed: 7 files, 37 tests |
| `pnpm --dir server test -- --run` | Passed: 57 files, 240 tests |
| `pnpm --dir server typecheck` | Passed |
| `pnpm --dir server exec eslint src/orders/orders.dto.ts src/orders/orders.validator.ts src/orders/orders.types.ts src/orders/orders.repository.ts src/orders/orders.service.ts src/orders/orders.controller.ts src/orders/__tests__/guest-purchase.test.ts src/orders/__tests__/orders.repository.test.ts src/notifications/notifications.service.ts --format=stylish` | Passed |
| `pnpm --dir server lint` | Passed |
| `pnpm --dir server build` | Passed; Prisma client generated and assets copied |
| `git diff --check` | Passed |
| `git diff --cached --check` | Passed before commit |
| `git commit -m "feat(server): support transactional guest purchase"` | Passed; commit `b98cd0b` |

The full Vitest run emitted existing MySQL connection-refused logs for `127.0.0.1:3307`; it still exited successfully. Vite’s existing config-loader warning also remained non-fatal.

## Security and compatibility review

- Guest purchase has no authentication guard because it is public, but it remains covered by the global CSRF middleware and the existing OrdersModule rate-limit middleware.
- Guest validation is strict and does not coerce product IDs/quantities or silently accept client pricing fields.
- Product prices, totals, stock, and promotion discounts come from the server preview and transactional repository/service logic. Duplicate product IDs are bounded and authoritative cart preview coalescing is reused.
- All dynamic SQL values are parameterized; placeholder lists are generated only from validated numeric IDs.
- The raw token is generated with cryptographically secure random bytes, returned in the successful creation response, never logged, and never inserted into an order row. Only its SHA-256 hash is persisted.
- Lookup requires both order ID and raw token, restricts repository selection to guest orders, and uses the existing timing-safe token matcher.
- Guest lookup output is whitelisted and excludes `user_id`, `guest_order_token_hash`, internal order-item IDs, admin/private fields, and timeline internals.
- Authenticated purchase, owner guards, admin guards, route-local response keys, payment quote behavior, promotion transaction behavior, and authenticated notification writes remain unchanged.
- No database migration was applied to production, and no production reset/seed operation was attempted.

## Assumptions

- The existing guest-preview response is the authoritative catalog/cart source for the non-Stripe guest purchase request because the guest request intentionally contains no client price or total.
- The validated shipping object is serialized as JSON into the existing `orders.shipping_address` compatibility field; guest contact fields use the dedicated nullable snapshot columns.
- Guest lookup returns the existing order detail’s payment/order fields and a safe item projection while omitting internal identity/token fields.
- Task 4 remains responsible for guest Stripe session creation and webhook finalization; no Stripe session/UI/routing work was added here.

## Risks and concerns

- No live MySQL service was available, so the new routes were not exercised through an HTTP request against a real database. Repository/service tests verify SQL, transaction sequencing, payment quoting, and rollback paths, but a local non-production database smoke test remains advisable after the migration is applied in a safe environment.
- The existing Prisma/MySQL guest-checkout migration is present in the repository from the foundation task but was not applied by this task, consistent with the instruction not to apply migrations to production.
- Existing Vite warnings and MySQL connection-refused logs remain environmental noise and are not caused by this Task 3 change.

## Working-tree preservation

Only the nine Task 3 files listed above were staged and committed. The pre-existing changes in CI/Wiki/docs, `server/package.json`, database-target configuration/tests, demo seed/verification/reset files, and the production migration/demo-seed plan remain unstaged and untouched.

## Fix

### Status

DONE_WITH_CONCERNS

### Fix commit

`389a887` — `fix(server): harden guest purchase authority`

### Changed files

- `server/src/orders/orders.service.ts`
- `server/src/orders/checkout-reservation.repository.ts`
- `server/src/orders/orders.types.ts`
- `server/src/orders/orders.validator.ts`
- `server/src/orders/__tests__/guest-purchase.test.ts`
- `server/src/orders/__tests__/orders.repository.test.ts`

### Verification

| Command | Result |
| --- | --- |
| `pnpm --dir server exec vitest run src/orders/__tests__/guest-purchase.test.ts --reporter=verbose` (initial RED) | Failed as expected: 4 review-regression failures before the fix |
| `pnpm --dir server exec vitest run src/orders/__tests__/orders.repository.test.ts --reporter=verbose` (new lock-query RED) | Failed as expected: missing transactional product-snapshot lock method |
| `pnpm --dir server exec vitest run src/orders/__tests__/guest-purchase.test.ts src/orders/__tests__/orders.repository.test.ts --reporter=verbose` | Passed: 2 files, 18 tests |
| `pnpm --dir server test -- --run` | Passed: 57 files, 243 tests; existing MySQL connection-refused logs remained because no local MySQL listener was available |
| `pnpm --dir server typecheck` | Passed |
| `pnpm --dir server lint` | Passed |
| `pnpm --dir server build` | Passed |
| `git diff --cached --check` | Passed before commit |

### Review findings resolved

- Critical: guest purchase now locks a full product snapshot inside the order transaction, including price, sale price, stock, catalog state, and snapshot fields. It recomputes merchandise total from that read, recalculates promotion discount transactionally, derives the payment quote from those values, and rolls back with a 409 response when the preview quote is stale.
- Important reservation availability: the transaction locks products in sorted order, reads active pending reservations after the product lock, rejects reservation-adjusted insufficiency before inserting the order, and uses the same product-then-reservation lock order as reservation creation. Regression coverage verifies a pending reservation prevents the purchase.
- Important lookup DTO: guest order items now use an explicit allowlist projection; injected/internal item fields are not returned.
- Minor order ID: both schema and service require a non-coercing positive safe integer, rejecting numeric strings and unsafe values.
- Minor email: guest email is trimmed, lowercased, and bounded to 255 characters before it reaches the persisted guest snapshot.

### Concerns

No live MySQL HTTP or concurrent-transaction smoke test could run because ports 3306 and 3307 were unavailable. The existing database integration harness was therefore not executable; focused transaction/repository regression coverage and the full mock-based server suite passed. No migration, seed, reset, or production database operation was performed.
