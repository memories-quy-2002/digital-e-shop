# Payment Task 5 report

## Status

Implemented the PayOS lookup and reconciliation provider boundary only. The unrelated `client/src/i18n/en.ts` modification and both existing plan files were preserved and not staged.

## TDD RED/GREEN evidence

- RED provider test: `pnpm --dir server exec vitest run src/payments/payos.service.test.ts` failed 1/4 with `TypeError: service.getPaymentLink is not a function`.
- RED repository test: the new focused run failed during module loading with `Cannot find module '../payment-reconciliation.repository'`.
- GREEN implementation run: `pnpm --dir server exec vitest run src/payments/payos.service.test.ts src/payments/__tests__/payment-reconciliation.service.test.ts` passed 2 files and 7 tests.
- GREEN typecheck: `pnpm --dir server typecheck` passed (`tsc -p tsconfig.json --noEmit`).
- `git diff --check` passed.

## Provider contract

`PayOSService.getPaymentLink({ paymentLinkId?, orderCode? })` rejects an empty identifier, calls the official SDK with the numeric order code or payment-link string, and returns `PayOSPaymentLookup` with `orderCode`, `paymentLinkId`, `amount`, `amountPaid`, `status`, and boundary currency `VND`.

## Repository SQL and idempotency behavior

- `insertWebhookEvent` inserts the normalized, non-secret event fields with placeholders and uses the supplied `TransactionContext`.
- `claimWebhookEvent` uses the unique `(provider, event_key)` key with `ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`, then locks and reads the existing row. It returns `inserted: true` for a new row, a same-hash duplicate with `payloadHashMatches: true`, or `conflict: true` for a different hash.
- `completeWebhookEvent`, `recordAttempt`, and `projectReconciliation` are parameterized transaction mutations.
- `listCandidates` clamps page size to 100, paginates with `LIMIT ? OFFSET ?`, joins pending-checkout/order-payment candidate data, and does not select guest token hashes.
- `getPendingCheckoutForUpdate` and `getOrderPaymentForUpdate` use `FOR UPDATE` and exclude guest token hashes from their projections.
- `listWebhookEvents` returns normalized event/audit fields only; it does not expose token material.

## Files changed

- `server/src/payments/payos.service.ts`
- `server/src/payments/payos.service.test.ts`
- `server/src/payments/payment.types.ts`
- `server/src/payments/payment-reconciliation.repository.ts`
- `server/src/payments/__tests__/payment-reconciliation.service.test.ts`

## Self-review

The implementation preserves historical payment columns and labels, adds no client/package/environment changes, keeps provider SDK access inside `PayOSService`, uses parameterized SQL values, and requires a transaction context for every mutation. The focused tests cover lookup normalization, new-event claiming, same-payload idempotency, payload conflict, pagination clamping, SQL placeholders, and guest-token exclusion.

## Concerns / follow-up

Task 6 still needs to own durable webhook orchestration and should consume the claim/complete methods without duplicating finalization logic. Task 7 still needs to define any broader admin-facing candidate/event query adaptations. No live MySQL integration was run in this task; SQL behavior is covered by query-contract unit tests.

## Commit

Required commit message: `feat(payments): add PayOS reconciliation boundary`
## Fix

### Findings addressed

- `listWebhookEvents` now matches finalized PayOS records using the provider-scoped pair `order_payments.provider_reference = CAST(payment_webhook_events.order_code AS CHAR)` and `order_payments.provider_payment_id = payment_webhook_events.payment_link_id`. The payment-link ID remains a string comparison and no token or secret fields are selected.
- `listCandidates` now builds provider and reconciliation predicates independently for both `order_payments` and `pending_checkouts`. Pending reservations use their provider and `PENDING` status; therefore a `cash` or non-`PENDING` filter cannot return a PayOS pending reservation. The 100-row limit, parameterized values, and token-hash exclusion remain intact.

### TDD evidence

- RED: `pnpm --dir server exec vitest run src/payments/__tests__/payment-reconciliation.service.test.ts` failed on the new webhook mapping assertion (old `provider_reference = payment_link_id` join) and candidate filter parity assertion (pending branch hard-coded to PayOS/PENDING).
- GREEN: `pnpm --dir server exec vitest run src/payments/__tests__/payment-reconciliation.service.test.ts` passed 1 file and 6 tests.
- Final focused GREEN: `pnpm --dir server exec vitest run src/payments/payos.service.test.ts src/payments/__tests__/payment-reconciliation.service.test.ts` passed 2 files and 10 tests.
- Typecheck: `pnpm --dir server typecheck` passed.
- Lint: `pnpm --dir server lint` passed.
- Diff check: `git diff --check` passed; Git reported only the existing LF-to-CRLF normalization warning.

### Files changed

- `server/src/payments/payment-reconciliation.repository.ts`
- `server/src/payments/__tests__/payment-reconciliation.service.test.ts`
- `server/src/payments/payments.module.ts`
- `.superpowers/sdd/payment-task-5-report.md`

### Self-review

The SQL remains parameterized for all filter and identifier values. The webhook join is constrained by provider, order code, and payment-link ID, avoiding broad matching. Candidate count and page queries use the same branch predicates and preserve `LIMIT ? OFFSET ?` with the 100-row clamp. No guest token hash is projected. The existing client localization change and both untracked plan files were not staged.

### Injectable wiring evaluation

`PaymentReconciliationRepository` is registered and exported from the existing `PaymentsModule`, which is already imported by `PayOSWebhookModule`. This is the smallest safe wiring change for Task 6 to inject the repository without changing the Task 6 webhook service or duplicating module ownership.

### Concerns

No live MySQL integration was run; the regression coverage is query-contract based. The `CAST(... AS CHAR)` comparison should be confirmed against the production MySQL collation/plan during Task 6 integration testing. No Task 6 webhook service code was changed.
