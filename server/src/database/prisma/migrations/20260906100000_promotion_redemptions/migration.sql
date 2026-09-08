UPDATE `pending_checkouts`
SET `status` = 'CONSUMED'
WHERE `consumed_at` IS NOT NULL AND `status` = 'PENDING';

UPDATE `pending_checkouts`
SET `expires_at` = DATE_ADD(`created_at`, INTERVAL 35 MINUTE)
WHERE `expires_at` IS NULL;

ALTER TABLE `pending_checkouts`
    MODIFY `expires_at` DATETIME NOT NULL;

ALTER TABLE `pending_checkouts`
    ADD CONSTRAINT `fk_pending_checkouts_discount`
        FOREIGN KEY (`discount_id`) REFERENCES `discounts` (`id`);

CREATE TABLE `discount_redemptions` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `discount_id` INT NOT NULL,
    `pending_checkout_id` INT NULL,
    `order_id` INT NULL,
    `user_id` VARCHAR(255) NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `expires_at` DATETIME NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `consumed_at` DATETIME NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_discount_redemptions_pending_checkout` (`pending_checkout_id`),
    UNIQUE KEY `uq_discount_redemptions_order` (`order_id`),
    INDEX `discount_redemptions_quota_idx` (`discount_id`, `status`, `expires_at`),
    CONSTRAINT `fk_discount_redemptions_discount`
        FOREIGN KEY (`discount_id`) REFERENCES `discounts` (`id`),
    CONSTRAINT `fk_discount_redemptions_checkout`
        FOREIGN KEY (`pending_checkout_id`) REFERENCES `pending_checkouts` (`id`),
    CONSTRAINT `fk_discount_redemptions_order`
        FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
