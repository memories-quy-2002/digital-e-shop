SET @add_password_reset_token_hash_sql = IF(
    EXISTS(
        SELECT 1 FROM `information_schema`.`COLUMNS`
        WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = 'users' AND `COLUMN_NAME` = 'password_reset_token_hash'
    ),
    'SELECT 1',
    'ALTER TABLE `users` ADD COLUMN `password_reset_token_hash` CHAR(64) NULL'
);
PREPARE add_password_reset_token_hash_stmt FROM @add_password_reset_token_hash_sql;
EXECUTE add_password_reset_token_hash_stmt;
DEALLOCATE PREPARE add_password_reset_token_hash_stmt;

SET @add_password_reset_expires_at_sql = IF(
    EXISTS(
        SELECT 1 FROM `information_schema`.`COLUMNS`
        WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = 'users' AND `COLUMN_NAME` = 'password_reset_expires_at'
    ),
    'SELECT 1',
    'ALTER TABLE `users` ADD COLUMN `password_reset_expires_at` DATETIME NULL'
);
PREPARE add_password_reset_expires_at_stmt FROM @add_password_reset_expires_at_sql;
EXECUTE add_password_reset_expires_at_stmt;
DEALLOCATE PREPARE add_password_reset_expires_at_stmt;

SET @add_pending_email_sql = IF(
    EXISTS(
        SELECT 1 FROM `information_schema`.`COLUMNS`
        WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = 'users' AND `COLUMN_NAME` = 'pending_email'
    ),
    'SELECT 1',
    'ALTER TABLE `users` ADD COLUMN `pending_email` VARCHAR(255) NULL'
);
PREPARE add_pending_email_stmt FROM @add_pending_email_sql;
EXECUTE add_pending_email_stmt;
DEALLOCATE PREPARE add_pending_email_stmt;

SET @add_email_change_token_hash_sql = IF(
    EXISTS(
        SELECT 1 FROM `information_schema`.`COLUMNS`
        WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = 'users' AND `COLUMN_NAME` = 'email_change_token_hash'
    ),
    'SELECT 1',
    'ALTER TABLE `users` ADD COLUMN `email_change_token_hash` CHAR(64) NULL'
);
PREPARE add_email_change_token_hash_stmt FROM @add_email_change_token_hash_sql;
EXECUTE add_email_change_token_hash_stmt;
DEALLOCATE PREPARE add_email_change_token_hash_stmt;

SET @add_email_change_expires_at_sql = IF(
    EXISTS(
        SELECT 1 FROM `information_schema`.`COLUMNS`
        WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = 'users' AND `COLUMN_NAME` = 'email_change_expires_at'
    ),
    'SELECT 1',
    'ALTER TABLE `users` ADD COLUMN `email_change_expires_at` DATETIME NULL'
);
PREPARE add_email_change_expires_at_stmt FROM @add_email_change_expires_at_sql;
EXECUTE add_email_change_expires_at_stmt;
DEALLOCATE PREPARE add_email_change_expires_at_stmt;

SET @add_password_reset_index_sql = IF(
    EXISTS(
        SELECT 1 FROM `information_schema`.`STATISTICS`
        WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = 'users' AND `INDEX_NAME` = 'users_password_reset_token_hash_idx'
    ),
    'SELECT 1',
    'CREATE INDEX `users_password_reset_token_hash_idx` ON `users` (`password_reset_token_hash`)'
);
PREPARE add_password_reset_index_stmt FROM @add_password_reset_index_sql;
EXECUTE add_password_reset_index_stmt;
DEALLOCATE PREPARE add_password_reset_index_stmt;

SET @add_email_change_index_sql = IF(
    EXISTS(
        SELECT 1 FROM `information_schema`.`STATISTICS`
        WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = 'users' AND `INDEX_NAME` = 'users_email_change_token_hash_idx'
    ),
    'SELECT 1',
    'CREATE INDEX `users_email_change_token_hash_idx` ON `users` (`email_change_token_hash`)'
);
PREPARE add_email_change_index_stmt FROM @add_email_change_index_sql;
EXECUTE add_email_change_index_stmt;
DEALLOCATE PREPARE add_email_change_index_stmt;

CREATE TABLE IF NOT EXISTS `marketing_subscriptions` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(255) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    `unsubscribe_token_hash` CHAR(64) NULL,
    `source` VARCHAR(40) NOT NULL DEFAULT 'footer',
    `user_id` VARCHAR(255) NULL,
    `subscribed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `unsubscribed_at` DATETIME NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_marketing_subscriptions_email` (`email`),
    UNIQUE KEY `uq_marketing_subscriptions_unsubscribe_token_hash` (`unsubscribe_token_hash`),
    KEY `marketing_subscriptions_status_subscribed_idx` (`status`, `subscribed_at`),
    KEY `marketing_subscriptions_user_id_idx` (`user_id`),
    CONSTRAINT `fk_marketing_subscriptions_user_id`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
