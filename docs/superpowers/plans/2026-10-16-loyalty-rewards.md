# Customer loyalty rewards implementation plan

## Outcome and rules

- Every authenticated account has a zero-point starting balance; guest orders do not accrue or redeem points.
- Award `floor(eligible merchandise VND / 1,000)` only after PayOS is verified paid or COD collection is confirmed. Eligible value is the merchandise subtotal after promotion and direct-points discounts; shipping is excluded.
- One point offsets one VND. The server caps redemption at the remaining merchandise value after promotion, locks the account during redemption, and stores an idempotent ledger entry.
- Checkout reservations hold points and release them exactly once on expiry/cancellation. Paid order creation commits the hold; canceled COD orders return spent points.
- Admin promotions may set an optional points cost. Claiming one creates a customer-owned voucher code and deducts points atomically. Existing promotion reservation/usage checks remain authoritative when the voucher is applied.
- Loyalty balance, ledger history, available vouchers, and redeemable offers are available in the customer account and at authenticated checkout.

## Acceptance criteria

1. Existing users read as zero until they earn or redeem points; no points are backfilled.
2. Duplicate PayOS webhook/reconciliation, COD confirmation, and checkout retries cannot duplicate points.
3. Concurrent checkouts cannot spend the same points; expired/canceled checkout holds are restored once.
4. Guests cannot see, claim, apply, earn, or spend customer loyalty points/vouchers.
5. A voucher is bound to its owner, one-use, expires with its source promotion, and follows the source promotion's date, minimum, and usage limits.
6. Admin can mark a promotion as a loyalty reward by assigning a positive point cost; leaving it blank keeps ordinary promotion behavior.
7. English and Vietnamese customer/admin copy covers loading, empty, success, validation, and recoverable error states.

## Implementation slices

1. Add loyalty schema/migration, policy tests, transaction repository/service/controller/module.
2. Integrate promotion reward costs and owner-scoped voucher reservation/consumption/release.
3. Integrate checkout point holds, VND pricing snapshots, verified payment earning, COD/cancellation reversals, and validators.
4. Add account rewards/history UI, checkout point controls, admin reward-cost field, translations, API/OpenAPI and Wiki documentation.
5. Run targeted and package checks, inspect the final diff, and leave database migrations unapplied.

## Verification

- Focused server unit tests for point math, ledger idempotency, voucher ownership, checkout hold/release, and payment award.
- Focused client tests for account rewards, checkout serialization and admin promotion cost.
- Full server/client tests, typecheck, lint, and build where dependencies are available; Prisma validate/generate; OpenAPI parse and `git diff --check`.
