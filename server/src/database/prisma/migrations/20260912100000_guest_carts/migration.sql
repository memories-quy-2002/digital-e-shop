CREATE TABLE `guest_carts` (
    `id` CHAR(36) NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `last_seen_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `converted_at` DATETIME NULL,
    `expires_at` DATETIME NOT NULL,
    PRIMARY KEY (`id`),
    INDEX `guest_carts_expires_idx` (`expires_at`),
    INDEX `guest_carts_conversion_updated_idx` (`converted_at`, `updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `guest_cart_items` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `guest_cart_id` CHAR(36) NOT NULL,
    `product_id` INT NOT NULL,
    `quantity` INT NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_guest_cart_items_cart_product` (`guest_cart_id`, `product_id`),
    INDEX `guest_cart_items_product_idx` (`product_id`),
    CONSTRAINT `fk_guest_cart_items_cart` FOREIGN KEY (`guest_cart_id`) REFERENCES `guest_carts` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_guest_cart_items_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
    CONSTRAINT `guest_cart_items_quantity_check` CHECK (`quantity` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
