# Payment Task 3 Report

## Status
Implemented and committed Payment Task 3: Record delivery and confirm COD atomically.

## RED evidence
Command: `pnpm --dir server exec vitest run src/orders/__tests__/orders.lifecycle.test.ts src/orders/__tests__/orders.controller.test.ts`

The first meaningful RED run exited 1 with 3 intended failures and 9 passing tests: pending COD did not write `delivered_at` or reconcile the cash ledger; unpaid PayOS delivery resolved instead of returning status 409; and the controller did not pass `admin-1` to the service.

A transient first attempt also exposed test-fixture syntax issues introduced while the patch helper was unavailable; those were corrected before recording the meaningful RED result.

## GREEN evidence
Command: `pnpm --dir server exec vitest run src/orders/__tests__/orders.lifecycle.test.ts src/orders/__tests__/orders.controller.test.ts`

Result: 2 test files passed, 12/12 tests passed. `git diff --check` also passed.

## Changes

- `orders.service.ts`: locks the order/latest payment; rejects unpaid PayOS; records `delivered_at`; confirms pending cash/COD once with reconciliation fields; backfills a missing legacy timestamp on repeated Done without a second timeline event; preserves statuses 0/1/2.
- `orders.repository.ts`: adds formatted `delivered_at` to summary/detail projections.
- `orders.controller.ts`: forwards the authenticated admin actor ID.
- `orders.types.ts`: adds `delivered_at` to summary/detail contracts.
- Lifecycle/controller tests cover COD confirmation, unpaid PayOS rejection, idempotent Done, and actor forwarding.

## Self-review

Only the six brief-listed order files were staged and committed. Existing `client/src/i18n/en.ts` changes and both plan files were preserved unstaged. No Task 4 consumers, client i18n, or plan files were edited. The final staged diff was 67 insertions and 13 deletions across six files. The exact required commit message was used.

## Concerns

- `pnpm --dir server typecheck` remains non-zero because of six existing payment-provider errors in `orders.service.ts` and `orders.payos.service.ts` related to the earlier VND/PayOS migration (Stripe provider typing, USD/VND quote typing, and a pre-existing four-argument call). These are outside this task's allowed behavior/scope and were not changed.
- Vitest prints the existing Vite `configLoader: 'native'` warning; tests still pass.
- The repository patch helper failed repeatedly due a Windows sandbox ACL error, so scoped edits were applied through an encoding-preserving fallback and reviewed with the final diff before commit.

## Commit

`a2550cf feat(orders): record delivery and confirm COD`## Fix

### Findings addressed

- Reordered the unpaid-PayOS rejection in `server/src/orders/orders.service.ts` so the locked status-1 idempotent branch runs first. A legacy status-1 order with pending PayOS and missing `delivered_at` now backfills the timestamp, returns the existing order, does not mark PayOS paid, and does not emit a new timeline event.
- Extended `server/src/orders/__tests__/orders.lifecycle.test.ts` with behavioral coverage for the inconsistent legacy PayOS case, exact COD reconciliation fields (`paid`, `MANUAL_CONFIRMED`, `last_reconciled_at`, and `COLLECTED`), and no duplicate COD payment update or timeline event on repeated Done.
- Corrected the `delivered_at` projection indentation in `server/src/orders/orders.repository.ts`.

### RED

Command: `pnpm --dir server exec vitest run src/orders/__tests__/orders.lifecycle.test.ts src/orders/__tests__/orders.controller.test.ts`

Result: 2 test files ran; 1 intended regression failed and the existing 12 tests passed. The legacy status-1 pending PayOS case rejected with `PayOS payment must be paid before delivery` instead of resolving and backfilling `delivered_at`.

### GREEN

Command: `pnpm --dir server exec vitest run src/orders/__tests__/orders.lifecycle.test.ts src/orders/__tests__/orders.controller.test.ts`

Result: 2 test files passed, 13/13 tests passed. `git diff --check` passed. Vitest emitted the existing Vite `configLoader: 'native'` warning.

### Files

- `server/src/orders/orders.service.ts`
- `server/src/orders/orders.repository.ts`
- `server/src/orders/__tests__/orders.lifecycle.test.ts`
- `.superpowers/sdd/payment-task-3-report.md`

### Self-review

The guard is evaluated only for status-0 Done transitions; status-1 repeats remain side-effect limited to timestamp backfill. Pending PayOS is never updated by the delivery action. COD reconciliation remains conditional on a pending cash ledger. Only the files listed above were staged for this fix; the pre-existing client i18n change and both plan files remain untouched and unstaged. No status values, future-task files, or client i18n files were changed.

### Concerns

- Luna was requested but no Luna/subagent tool was exposed in this session, so the scoped fix was completed locally.
- The repository’s existing Vite native-config warning remains. The earlier report’s unrelated server typecheck/payment-provider concerns were not re-run or changed by this fix.