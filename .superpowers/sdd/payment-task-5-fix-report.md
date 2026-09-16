# Payment Task 5 fix report

## Scope

Fixed only review finding P5-001 in PaymentReconciliationRepository.listCandidates and updated its focused regression coverage.

Pending-checkout candidates now always use pc.status = 'PENDING'. A pending branch is included when reconciliationStatus is absent or PENDING; for other reconciliation filters, the pending branch is explicitly unsatisfiable. The order_payments branch continues to filter op.reconciliation_status with the supplied value.

## TDD evidence

- RED: pnpm --dir server exec vitest run src/payments/__tests__/payment-reconciliation.service.test.ts failed 3 tests for PENDING, CONSUMED, and PAID because the implementation compared pc.status to a parameter.
- GREEN: the same focused repository suite passed 1 file and 9 tests.
- Final focused GREEN: the PayOS and reconciliation suites passed 2 files and 13 tests.

The regression table covers absent status, PENDING, CONSUMED, and PAID, and checks both count/list UNION queries, including provider and order-payment parameter ordering.

## Verification

- pnpm --dir server exec vitest run src/payments/payos.service.test.ts src/payments/__tests__/payment-reconciliation.service.test.ts - PASS, 2 files / 13 tests.
- pnpm --dir server typecheck - PASS.
- pnpm --dir server lint - PASS.
- git diff --check - PASS.

No requested test command hung. Vitest emitted the existing Vite CommonJS/ESM configuration warning, but exited successfully.

## Files

- server/src/payments/payment-reconciliation.repository.ts
- server/src/payments/__tests__/payment-reconciliation.service.test.ts
- .superpowers/sdd/payment-task-5-fix-report.md
