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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
