CREATE TABLE `stock_counts` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `status` VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
    `version` INT UNSIGNED NOT NULL DEFAULT 1,
    `note` VARCHAR(2000) NULL,
    `created_by_id` VARCHAR(255) COLLATE utf8mb4_general_ci NOT NULL,
    `submitted_by_id` VARCHAR(255) COLLATE utf8mb4_general_ci NULL,
    `approved_by_id` VARCHAR(255) COLLATE utf8mb4_general_ci NULL,
    `canceled_by_id` VARCHAR(255) COLLATE utf8mb4_general_ci NULL,
    `canceled_reason` VARCHAR(500) NULL,
    `submitted_at` DATETIME(3) NULL,
    `approved_at` DATETIME(3) NULL,
    `canceled_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    KEY `idx_stock_counts_status_updated` (`status`, `updated_at`, `id`),
    KEY `idx_stock_counts_creator_created` (`created_by_id`, `created_at`),
    CONSTRAINT `fk_stock_counts_created_by` FOREIGN KEY (`created_by_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `fk_stock_counts_submitted_by` FOREIGN KEY (`submitted_by_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `fk_stock_counts_approved_by` FOREIGN KEY (`approved_by_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `fk_stock_counts_canceled_by` FOREIGN KEY (`canceled_by_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `chk_stock_counts_version_positive` CHECK (`version` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `stock_count_items` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `stock_count_id` INT NOT NULL,
    `product_id` INT NOT NULL,
    `sku` VARCHAR(64) NOT NULL,
    `product_name` VARCHAR(255) NOT NULL,
    `baseline_stock` INT NOT NULL,
    `baseline_revision` BIGINT UNSIGNED NOT NULL,
    `counted_quantity` INT NULL,
    `reason` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_stock_count_items_count_product` (`stock_count_id`, `product_id`),
    KEY `idx_stock_count_items_product_count` (`product_id`, `stock_count_id`),
    CONSTRAINT `fk_stock_count_items_count` FOREIGN KEY (`stock_count_id`) REFERENCES `stock_counts` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT `fk_stock_count_items_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT `chk_stock_count_items_baseline_nonnegative` CHECK (`baseline_stock` >= 0),
    CONSTRAINT `chk_stock_count_items_count_nonnegative` CHECK (`counted_quantity` IS NULL OR `counted_quantity` >= 0),
    CONSTRAINT `chk_stock_count_items_reason_for_difference` CHECK (`counted_quantity` IS NULL OR `counted_quantity` = `baseline_stock` OR (`reason` IS NOT NULL AND CHAR_LENGTH(TRIM(`reason`)) > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE `inventory_movements`
    DROP INDEX `idx_inventory_movements_stock_count_item`,
    ADD UNIQUE KEY `uq_inventory_movements_stock_count_item` (`stock_count_item_id`),
    ADD CONSTRAINT `fk_inventory_movements_stock_count_item` FOREIGN KEY (`stock_count_item_id`) REFERENCES `stock_count_items` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT `chk_inventory_movements_single_document_source` CHECK (`purchase_receipt_line_id` IS NULL OR `stock_count_item_id` IS NULL);
