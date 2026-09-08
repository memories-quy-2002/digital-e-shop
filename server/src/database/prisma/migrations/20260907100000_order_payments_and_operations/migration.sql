ALTER TABLE `orders`
    ADD COLUMN `currency` CHAR(3) NOT NULL DEFAULT 'USD',
    ADD COLUMN `inventory_restored_at` DATETIME NULL,
    ADD COLUMN `cancellation_reason` TEXT NULL;

CREATE TABLE `order_payments` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `order_id` INT NOT NULL,
    `provider` VARCHAR(32) NOT NULL,
    `status` VARCHAR(24) NOT NULL,
    `provider_reference` VARCHAR(255) NULL,
    `provider_payment_id` VARCHAR(255) NULL,
    `idempotency_key` VARCHAR(128) NOT NULL,
    `base_amount` DECIMAL(11,2) NOT NULL,
    `base_currency` CHAR(3) NOT NULL DEFAULT 'USD',
    `amount` DECIMAL(14,2) NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `fx_rate` DECIMAL(18,6) NOT NULL DEFAULT 1,
    `paid_at` DATETIME NULL,
    `refunded_at` DATETIME NULL,
    `refund_reference` VARCHAR(255) NULL,
    `simulated` TINYINT NOT NULL DEFAULT 0,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_order_payments_idempotency` (`idempotency_key`),
    INDEX `order_payments_order_status_idx` (`order_id`, `status`),
    INDEX `order_payments_provider_reference_idx` (`provider`, `provider_reference`),
    CONSTRAINT `fk_order_payments_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `support_tickets` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `user_id` VARCHAR(255) NOT NULL,
    `order_id` INT NULL,
    `category` VARCHAR(32) NOT NULL DEFAULT 'general',
    `subject` VARCHAR(160) NOT NULL,
    `message` TEXT NOT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'OPEN',
    `priority` VARCHAR(16) NOT NULL DEFAULT 'NORMAL',
    `admin_note` TEXT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `support_tickets_user_created_idx` (`user_id`, `created_at`),
    INDEX `support_tickets_queue_idx` (`status`, `priority`, `created_at`),
    CONSTRAINT `fk_support_tickets_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
    CONSTRAINT `fk_support_tickets_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
