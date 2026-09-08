ALTER TABLE `customer_sessions`
    ADD COLUMN `refresh_token_hash` CHAR(64) NULL,
    ADD COLUMN `refresh_expires_at` DATETIME NULL,
    ADD COLUMN `revoked_at` DATETIME NULL,
    ADD COLUMN `last_used_at` DATETIME NULL;

CREATE INDEX `customer_sessions_user_active_idx`
    ON `customer_sessions` (`user_id`, `revoked_at`, `refresh_expires_at`);
