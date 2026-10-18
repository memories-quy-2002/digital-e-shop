CREATE TABLE `purchase_receipts` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `purchase_order_id` INT NOT NULL,
    `idempotency_key` CHAR(36) NOT NULL,
    `payload_hash` CHAR(64) NOT NULL,
    `actor_id` VARCHAR(255) COLLATE utf8mb4_general_ci NOT NULL,
    `note` VARCHAR(2000) NULL,
    `total_accepted_cost_vnd` DECIMAL(20, 0) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_purchase_receipts_order_idempotency` (`purchase_order_id`, `idempotency_key`),
    KEY `idx_purchase_receipts_order_created` (`purchase_order_id`, `created_at`, `id`),
    CONSTRAINT `fk_purchase_receipts_order` FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT `fk_purchase_receipts_actor` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `purchase_receipt_lines` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `purchase_receipt_id` INT NOT NULL,
    `purchase_order_item_id` INT NOT NULL,
    `product_id` INT NOT NULL,
    `sku` VARCHAR(64) NOT NULL,
    `product_name` VARCHAR(255) NOT NULL,
    `expected_quantity` INT NOT NULL,
    `accepted_quantity` INT NOT NULL,
    `rejected_quantity` INT NOT NULL,
    `missing_quantity` INT NOT NULL,
    `planned_unit_cost_vnd` DECIMAL(20, 0) NOT NULL,
    `unit_cost_vnd` DECIMAL(20, 0) NOT NULL,
    `actual_cost_reason` VARCHAR(500) NULL,
    `note` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_purchase_receipt_lines_receipt_order_item` (`purchase_receipt_id`, `purchase_order_item_id`),
    KEY `idx_purchase_receipt_lines_order_item` (`purchase_order_item_id`, `purchase_receipt_id`),
    CONSTRAINT `fk_purchase_receipt_lines_receipt` FOREIGN KEY (`purchase_receipt_id`) REFERENCES `purchase_receipts` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT `fk_purchase_receipt_lines_order_item` FOREIGN KEY (`purchase_order_item_id`) REFERENCES `purchase_order_items` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT `fk_purchase_receipt_lines_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE `inventory_movements`
    ADD COLUMN `purchase_receipt_line_id` INT NULL AFTER `actor_id`,
    ADD COLUMN `stock_count_item_id` INT NULL AFTER `purchase_receipt_line_id`,
    ADD UNIQUE KEY `uq_inventory_movements_purchase_receipt_line` (`purchase_receipt_line_id`),
    ADD KEY `idx_inventory_movements_stock_count_item` (`stock_count_item_id`),
    ADD CONSTRAINT `fk_inventory_movements_purchase_receipt_line` FOREIGN KEY (`purchase_receipt_line_id`) REFERENCES `purchase_receipt_lines` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
