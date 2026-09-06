ALTER TABLE `pending_checkouts`
    MODIFY `stripe_session_id` VARCHAR(255) NULL,
    ADD COLUMN `reservation_token` CHAR(36) NULL,
    ADD COLUMN `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    ADD COLUMN `expires_at` DATETIME NULL,
    ADD COLUMN `discount_id` INT NULL,
    ADD UNIQUE KEY `uq_pending_checkouts_reservation_token` (`reservation_token`),
    ADD INDEX `pending_checkouts_status_expiry_idx` (`status`, `expires_at`);

UPDATE `pending_checkouts`
SET `reservation_token` = UUID()
WHERE `reservation_token` IS NULL;

ALTER TABLE `pending_checkouts`
    MODIFY `reservation_token` CHAR(36) NOT NULL;

CREATE TABLE `inventory_reservations` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `pending_checkout_id` INT NOT NULL,
    `product_id` INT NOT NULL,
    `quantity` INT NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_inventory_reservation_checkout_product` (`pending_checkout_id`, `product_id`),
    INDEX `inventory_reservations_product_idx` (`product_id`),
    CONSTRAINT `fk_inventory_reservations_checkout`
        FOREIGN KEY (`pending_checkout_id`) REFERENCES `pending_checkouts` (`id`),
    CONSTRAINT `fk_inventory_reservations_product`
        FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
    CONSTRAINT `chk_inventory_reservations_quantity_positive` CHECK (`quantity` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
