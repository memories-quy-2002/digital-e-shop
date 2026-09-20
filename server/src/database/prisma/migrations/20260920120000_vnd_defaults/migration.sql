-- New orders and payment-ledger rows are Vietnam-first VND records.
-- Existing rows are historical snapshots and are intentionally not backfilled.
ALTER TABLE `orders`
    ALTER COLUMN `currency` SET DEFAULT 'VND';

ALTER TABLE `order_payments`
    ALTER COLUMN `base_currency` SET DEFAULT 'VND';
