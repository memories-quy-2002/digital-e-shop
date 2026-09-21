CREATE TABLE `product_alert_subscriptions` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `user_id` VARCHAR(255) NOT NULL,
    `product_id` INT NOT NULL,
    `price_drop_enabled` TINYINT(1) NOT NULL DEFAULT 0,
    `back_in_stock_enabled` TINYINT(1) NOT NULL DEFAULT 0,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_product_alert_subscriptions_user_product` (`user_id`, `product_id`),
    INDEX `product_alert_subscriptions_product_idx` (`product_id`),
    CONSTRAINT `fk_product_alert_subscriptions_user`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
    CONSTRAINT `fk_product_alert_subscriptions_product`
        FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `product_alert_events` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `product_id` INT NOT NULL,
    `alert_type` VARCHAR(24) NOT NULL,
    `previous_price` DECIMAL(10,2) NOT NULL,
    `current_price` DECIMAL(10,2) NOT NULL,
    `previous_stock` INT NOT NULL,
    `current_stock` INT NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `product_alert_events_product_type_created_idx` (`product_id`, `alert_type`, `created_at`),
    CONSTRAINT `fk_product_alert_events_product`
        FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE `customer_notifications`
    ADD COLUMN `metadata` JSON NULL AFTER `link`,
    ADD COLUMN `alert_event_id` INT NULL AFTER `metadata`,
    ADD INDEX `customer_notifications_alert_event_idx` (`alert_event_id`),
    ADD UNIQUE KEY `uq_customer_notifications_alert_event_user` (`alert_event_id`, `user_id`);
