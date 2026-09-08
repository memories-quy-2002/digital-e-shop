CREATE TABLE IF NOT EXISTS `inventory_movements` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `product_id` INT NOT NULL,
    `order_id` INT NULL,
    `movement_type` VARCHAR(40) NOT NULL,
    `quantity_change` INT NOT NULL,
    `stock_before` INT NULL,
    `stock_after` INT NULL,
    `note` VARCHAR(255) NULL,
    `actor_id` VARCHAR(255) NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `inventory_movements_product_id_idx` (`product_id`),
    INDEX `inventory_movements_created_at_idx` (`created_at`)
);

CREATE TABLE IF NOT EXISTS `order_status_events` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `order_id` INT NOT NULL,
    `status` INT NOT NULL,
    `label` VARCHAR(80) NOT NULL,
    `note` VARCHAR(255) NULL,
    `actor_id` VARCHAR(255) NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `order_status_events_order_id_idx` (`order_id`),
    INDEX `order_status_events_created_at_idx` (`created_at`)
);

CREATE TABLE IF NOT EXISTS `customer_addresses` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `user_id` VARCHAR(255) NOT NULL,
    `label` VARCHAR(80) NOT NULL DEFAULT 'Shipping address',
    `recipient_name` VARCHAR(160) NULL,
    `phone_number` VARCHAR(40) NULL,
    `address_line` VARCHAR(255) NOT NULL,
    `city` VARCHAR(120) NULL,
    `country` VARCHAR(120) NULL,
    `is_default` TINYINT(1) NOT NULL DEFAULT 0,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `customer_addresses_user_id_idx` (`user_id`)
);

CREATE TABLE IF NOT EXISTS `customer_notifications` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `user_id` VARCHAR(255) NOT NULL,
    `type` VARCHAR(40) NOT NULL DEFAULT 'order',
    `title` VARCHAR(160) NOT NULL,
    `message` VARCHAR(500) NOT NULL,
    `link` VARCHAR(255) NULL,
    `read_at` DATETIME NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `customer_notifications_user_id_idx` (`user_id`),
    INDEX `customer_notifications_created_at_idx` (`created_at`)
);

ALTER TABLE `users`
    MODIFY COLUMN `token` TEXT NOT NULL;

SET @add_auth_provider_sql = IF(
    EXISTS(
        SELECT 1
        FROM `information_schema`.`COLUMNS`
        WHERE `TABLE_SCHEMA` = DATABASE()
          AND `TABLE_NAME` = 'users'
          AND `COLUMN_NAME` = 'auth_provider'
    ),
    'SELECT 1',
    'ALTER TABLE `users` ADD COLUMN `auth_provider` VARCHAR(32) NULL'
);
PREPARE add_auth_provider_stmt FROM @add_auth_provider_sql;
EXECUTE add_auth_provider_stmt;
DEALLOCATE PREPARE add_auth_provider_stmt;

SET @add_provider_user_id_sql = IF(
    EXISTS(
        SELECT 1
        FROM `information_schema`.`COLUMNS`
        WHERE `TABLE_SCHEMA` = DATABASE()
          AND `TABLE_NAME` = 'users'
          AND `COLUMN_NAME` = 'provider_user_id'
    ),
    'SELECT 1',
    'ALTER TABLE `users` ADD COLUMN `provider_user_id` VARCHAR(255) NULL'
);
PREPARE add_provider_user_id_stmt FROM @add_provider_user_id_sql;
EXECUTE add_provider_user_id_stmt;
DEALLOCATE PREPARE add_provider_user_id_stmt;
