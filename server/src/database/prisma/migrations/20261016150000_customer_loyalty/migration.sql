ALTER TABLE `discounts`
    ADD COLUMN `loyalty_points_cost` INT NULL;

ALTER TABLE `orders`
    ADD COLUMN `loyalty_points_redeemed` INT NOT NULL DEFAULT 0,
    ADD COLUMN `loyalty_discount` DECIMAL(11, 2) NOT NULL DEFAULT 0;

ALTER TABLE `pending_checkouts`
    ADD COLUMN `loyalty_points_redeemed` INT NOT NULL DEFAULT 0,
    ADD COLUMN `loyalty_discount` DECIMAL(11, 2) NOT NULL DEFAULT 0;

CREATE TABLE `loyalty_accounts` (
    `user_id` VARCHAR(255) NOT NULL,
    `balance_points` INT NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`user_id`),
    CONSTRAINT `fk_loyalty_accounts_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `loyalty_vouchers` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `user_id` VARCHAR(255) NOT NULL,
    `promotion_id` INT NOT NULL,
    `voucher_code` VARCHAR(64) NOT NULL,
    `points_cost` INT NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'AVAILABLE',
    `pending_checkout_id` INT NULL,
    `order_id` INT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `redeemed_at` DATETIME(3) NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_loyalty_voucher_code` (`voucher_code`),
    UNIQUE KEY `uq_loyalty_voucher_checkout` (`pending_checkout_id`),
    UNIQUE KEY `uq_loyalty_voucher_order` (`order_id`),
    INDEX `loyalty_vouchers_user_status_idx` (`user_id`, `status`, `id`),
    INDEX `loyalty_vouchers_promotion_status_idx` (`promotion_id`, `status`),
    CONSTRAINT `fk_loyalty_vouchers_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
    CONSTRAINT `fk_loyalty_vouchers_promotion` FOREIGN KEY (`promotion_id`) REFERENCES `discounts` (`id`),
    CONSTRAINT `fk_loyalty_vouchers_checkout` FOREIGN KEY (`pending_checkout_id`) REFERENCES `pending_checkouts` (`id`),
    CONSTRAINT `fk_loyalty_vouchers_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `loyalty_ledger` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` VARCHAR(255) NOT NULL,
    `order_id` INT NULL,
    `voucher_id` INT NULL,
    `pending_checkout_id` INT NULL,
    `entry_type` VARCHAR(32) NOT NULL,
    `points_delta` INT NOT NULL,
    `amount_vnd` BIGINT UNSIGNED NULL,
    `event_key` VARCHAR(191) NOT NULL,
    `description` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_loyalty_ledger_event_key` (`event_key`),
    INDEX `loyalty_ledger_user_created_idx` (`user_id`, `id`),
    INDEX `loyalty_ledger_order_idx` (`order_id`, `entry_type`),
    CONSTRAINT `fk_loyalty_ledger_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
    CONSTRAINT `fk_loyalty_ledger_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
    CONSTRAINT `fk_loyalty_ledger_voucher` FOREIGN KEY (`voucher_id`) REFERENCES `loyalty_vouchers` (`id`),
    CONSTRAINT `fk_loyalty_ledger_checkout` FOREIGN KEY (`pending_checkout_id`) REFERENCES `pending_checkouts` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
