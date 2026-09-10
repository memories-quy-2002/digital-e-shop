ALTER TABLE `orders`
    MODIFY `user_id` VARCHAR(255) NULL,
    ADD COLUMN `guest_email` VARCHAR(255) NULL AFTER `user_id`,
    ADD COLUMN `guest_name` VARCHAR(160) NULL AFTER `guest_email`,
    ADD COLUMN `guest_phone` VARCHAR(40) NULL AFTER `guest_name`,
    ADD COLUMN `guest_order_token_hash` CHAR(64) NULL AFTER `guest_phone`,
    ADD UNIQUE KEY `uq_orders_guest_order_token_hash` (`guest_order_token_hash`),
    ADD INDEX `idx_orders_guest_email` (`guest_email`);

ALTER TABLE `pending_checkouts`
    MODIFY `user_id` VARCHAR(255) NULL,
    ADD COLUMN `guest_email` VARCHAR(255) NULL AFTER `user_id`,
    ADD COLUMN `guest_name` VARCHAR(160) NULL AFTER `guest_email`,
    ADD COLUMN `guest_phone` VARCHAR(40) NULL AFTER `guest_name`,
    ADD COLUMN `guest_order_token_hash` CHAR(64) NULL AFTER `guest_phone`,
    ADD UNIQUE KEY `uq_pending_checkouts_guest_order_token_hash` (`guest_order_token_hash`),
    ADD INDEX `idx_pending_checkouts_guest_email` (`guest_email`);

ALTER TABLE `discount_redemptions`
    MODIFY `user_id` VARCHAR(255) NULL;
