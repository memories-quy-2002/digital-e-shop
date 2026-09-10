SET @add_email_verified_at_sql = IF(
    EXISTS(
        SELECT 1 FROM `information_schema`.`COLUMNS`
        WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = 'users' AND `COLUMN_NAME` = 'email_verified_at'
    ),
    'SELECT 1',
    'ALTER TABLE `users` ADD COLUMN `email_verified_at` DATETIME NULL'
);
PREPARE add_email_verified_at_stmt FROM @add_email_verified_at_sql;
EXECUTE add_email_verified_at_stmt;
DEALLOCATE PREPARE add_email_verified_at_stmt;

SET @add_email_verification_token_hash_sql = IF(
    EXISTS(
        SELECT 1 FROM `information_schema`.`COLUMNS`
        WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = 'users' AND `COLUMN_NAME` = 'email_verification_token_hash'
    ),
    'SELECT 1',
    'ALTER TABLE `users` ADD COLUMN `email_verification_token_hash` CHAR(64) NULL'
);
PREPARE add_email_verification_token_hash_stmt FROM @add_email_verification_token_hash_sql;
EXECUTE add_email_verification_token_hash_stmt;
DEALLOCATE PREPARE add_email_verification_token_hash_stmt;

SET @add_email_verification_expires_at_sql = IF(
    EXISTS(
        SELECT 1 FROM `information_schema`.`COLUMNS`
        WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = 'users' AND `COLUMN_NAME` = 'email_verification_expires_at'
    ),
    'SELECT 1',
    'ALTER TABLE `users` ADD COLUMN `email_verification_expires_at` DATETIME NULL'
);
PREPARE add_email_verification_expires_at_stmt FROM @add_email_verification_expires_at_sql;
EXECUTE add_email_verification_expires_at_stmt;
DEALLOCATE PREPARE add_email_verification_expires_at_stmt;

SET @add_email_verification_sent_at_sql = IF(
    EXISTS(
        SELECT 1 FROM `information_schema`.`COLUMNS`
        WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = 'users' AND `COLUMN_NAME` = 'email_verification_sent_at'
    ),
    'SELECT 1',
    'ALTER TABLE `users` ADD COLUMN `email_verification_sent_at` DATETIME NULL'
);
PREPARE add_email_verification_sent_at_stmt FROM @add_email_verification_sent_at_sql;
EXECUTE add_email_verification_sent_at_stmt;
DEALLOCATE PREPARE add_email_verification_sent_at_stmt;

UPDATE `users`
SET `email_verified_at` = COALESCE(`created_at`, UTC_TIMESTAMP())
WHERE `status` = 'Active' AND `email_verified_at` IS NULL;

CREATE INDEX `users_email_verification_token_hash_idx`
    ON `users` (`email_verification_token_hash`);
