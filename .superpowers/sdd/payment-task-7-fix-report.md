Status: completed

Files changed:
- server/src/payments/payment-reconciliation.service.ts
- server/src/payments/payment-reconciliation.repository.ts
- server/src/payments/__tests__/admin-payment-reconciliation.service.test.ts
- server/src/payments/__tests__/admin-payments.controller.test.ts
- server/src/payments/__tests__/payment-reconciliation.service.test.ts
- .superpowers/sdd/payment-task-7-fix-report.md

Findings:
- Non-success reconciliation attempts now append audit rows without changing the durable payment projection; only exact successful PAID PayOS reconciliation projects MATCHED.
- COD confirmation now updates pending and already-paid cash rows atomically, preserves existing paid_at, reads back the row, and audits the confirmation.
- Default candidates exclude terminal MATCHED PayOS order payments while explicit reconciliationStatus filters remain available.
- Order-payment reconciliation re-locks and revalidates reference, amount, currency, provider, and local status after PayOS lookup before finalization.
- Duplicate payment-test blocks were removed while retaining the focused regressions.

Verification:
- `pnpm --dir server exec vitest run src/payments/__tests__/admin-payment-reconciliation.service.test.ts src/payments/__tests__/admin-payments.controller.test.ts src/payments/__tests__/payment-reconciliation.service.test.ts src/payments/payosWebhook.controller.test.ts src/payments/payos.service.test.ts src/payments/payment-provider.service.test.ts src/payments/currency.test.ts` — passed, 7 files / 71 tests.
- `pnpm --dir server typecheck` — passed.
- `pnpm --dir server lint` — passed.
- `git diff --check` — passed.

Risks:
- Verification uses mocked repository transactions; production behavior still depends on the existing MySQL transaction/locking implementation and PayOS provider contract.
- Vitest emits expected warning/error logs from negative webhook tests and a Vite config warning; the tests pass.