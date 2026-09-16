# Payment Task 6 review-fix report

## Result

Fixed all four Important findings from the scoped review of commit `2984378` on the current branch. No worktree was created and unrelated dirty files were preserved.

## Fixes

- **I-1 stale `PROCESSING` recovery:** `payment_webhook_events.updated_at` is now a bounded 15-minute lease. A same-payload `PROCESSING` event is reclaimed only when the atomic update matches its current status, payload hash, and `attempt_count`; reclaiming increments `attempt_count` to create a new lease generation. Fresh events remain retryable with HTTP 500.
- **I-2 conditional terminal transitions:** webhook completion now requires expected status and lease generation and returns whether `affectedRows` was exactly one. A stale worker therefore cannot overwrite a newer `MISMATCH`, `PROCESSED`, or other terminal transition. The concurrent same-key/different-hash regression verifies this behavior.
- **I-3 exact outer success:** normalization accepts only literal `true` for the successful-event gate. String and numeric values do not finalize, with service and controller boundary coverage.
- **I-4 null finalizer classification:** `finalizePayOSCheckout` checks for an already-created PayOS order/payment when no reservation exists. The lookup requires the exact PayOS order code, payment-link ID, amount, and `VND`; otherwise the finalizer preserves its nullable result and does not accept mismatches.

## Changed files

- `server/src/payments/payment-reconciliation.repository.ts`
- `server/src/payments/payment-reconciliation.service.ts`
- `server/src/payments/__tests__/payment-reconciliation.service.test.ts`
- `server/src/payments/payosWebhook.controller.test.ts`
- `server/src/orders/orders.service.ts`
- `server/src/orders/__tests__/orders.payos.finalization.test.ts`
- `.superpowers/sdd/payment-task-6-fix-report.md`

## Verification

- Test-first RED run: new regressions failed for the pre-fix implementation.
- `pnpm --dir server exec vitest run src/payments/currency.test.ts src/payments/payment-provider.service.test.ts src/payments/payos.service.test.ts src/orders/__tests__/orders.payos.service.test.ts src/payments/__tests__/payment-reconciliation.service.test.ts src/payments/payosWebhook.controller.test.ts src/orders/__tests__/orders.payos.finalization.test.ts` — **54 passed**.
- `pnpm --dir server typecheck` — passed.
- `pnpm --dir server lint` — passed.
- `pnpm --dir server build` — passed.
- `git diff --check` — passed; Git emitted only existing line-ending conversion warnings.

No live MySQL integration or production migration/seed operation was run. The existing migration remains user/deployment controlled.
