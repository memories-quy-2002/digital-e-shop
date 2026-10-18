ALTER TABLE `orders`
    DROP INDEX `uq_orders_stripe_checkout_session`,
    DROP INDEX `idx_orders_stripe_checkout_session`,
    DROP COLUMN `stripe_checkout_session_id`,
    DROP COLUMN `stripe_payment_intent_id`;

ALTER TABLE `pending_checkouts`
    DROP INDEX `uq_pending_checkouts_session`,
    DROP COLUMN `stripe_session_id`;
