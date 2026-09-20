ALTER TABLE `order_payments`
    ADD COLUMN `refunded_amount` DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER `paid_at`;
