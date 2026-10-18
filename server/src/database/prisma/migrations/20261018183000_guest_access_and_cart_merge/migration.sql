CREATE TABLE `guest_order_access_recovery_challenges` (
    `id` CHAR(36) NOT NULL,
    `order_id` INT NOT NULL,
    `email_hash` CHAR(64) NOT NULL,
    `otp_hash` CHAR(64) NOT NULL,
    `attempt_count` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `expires_at` DATETIME(3) NOT NULL,
    `resend_after` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    KEY `idx_guest_order_recovery_rate` (`order_id`, `email_hash`, `created_at`),
    KEY `idx_guest_order_recovery_active` (`order_id`, `email_hash`, `used_at`, `expires_at`),
    CONSTRAINT `fk_guest_order_recovery_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `cart_merge_operations` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `user_id` VARCHAR(255) COLLATE utf8mb4_general_ci NOT NULL,
    `operation_id` CHAR(36) NOT NULL,
    `payload_hash` CHAR(64) NOT NULL,
    `result_json` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_cart_merge_user_operation` (`user_id`, `operation_id`),
    KEY `idx_cart_merge_user_created` (`user_id`, `created_at`),
    CONSTRAINT `fk_cart_merge_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
