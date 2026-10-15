CREATE TABLE `financial_evidence` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `uploaded_by` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `original_filename` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(100) NOT NULL,
  `byte_size` INT UNSIGNED NOT NULL,
  `sha256` CHAR(64) NOT NULL,
  `content` LONGBLOB NOT NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `financial_evidence_uploaded_by_idx` (`uploaded_by`),
  CONSTRAINT `financial_evidence_uploader_fk` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `financial_evidence_size_ck` CHECK (`byte_size` > 0 AND `byte_size` <= 2097152)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cod_settlements` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `order_id` INT NOT NULL,
  `expected_cod_vnd` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `collected_vnd` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `carrier_fee_vnd` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `remitted_vnd` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `currency` CHAR(3) NOT NULL DEFAULT 'VND',
  `status` ENUM('PENDING','MATCHED','MISMATCH') NOT NULL DEFAULT 'PENDING',
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cod_settlements_order` (`order_id`),
  CONSTRAINT `cod_settlements_order_fk` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `cod_settlements_currency_ck` CHECK (`currency` = 'VND')
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cod_settlement_events` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `settlement_id` INT NOT NULL,
  `event_type` ENUM('COLLECTION','REMITTANCE') NOT NULL,
  `actor_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  `amount_vnd` BIGINT UNSIGNED NOT NULL,
  `carrier_fee_vnd` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `transfer_reference` VARCHAR(191) NULL,
  `transfer_date` DATE NULL,
  `evidence_id` INT NULL,
  `previous_values` JSON NULL,
  `new_values` JSON NOT NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cod_settlement_transfer_reference` (`transfer_reference`),
  KEY `cod_settlement_events_settlement_created_idx` (`settlement_id`,`created_at`),
  KEY `cod_settlement_events_actor_idx` (`actor_id`),
  CONSTRAINT `cod_settlement_events_parent_fk` FOREIGN KEY (`settlement_id`) REFERENCES `cod_settlements` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `cod_settlement_events_actor_fk` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `cod_settlement_events_evidence_fk` FOREIGN KEY (`evidence_id`) REFERENCES `financial_evidence` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `manual_refund_operations` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `request_id` INT NOT NULL,
  `order_payment_id` INT NOT NULL,
  `actor_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `idempotency_key` VARCHAR(191) NOT NULL,
  `transfer_reference` VARCHAR(191) NOT NULL,
  `transfer_date` DATE NOT NULL,
  `reviewed_reason` VARCHAR(500) NOT NULL,
  `amount_vnd` BIGINT UNSIGNED NOT NULL,
  `currency` CHAR(3) NOT NULL DEFAULT 'VND',
  `evidence_id` INT NOT NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_manual_refund_idempotency` (`idempotency_key`),
  UNIQUE KEY `uq_manual_refund_transfer_reference` (`transfer_reference`),
  KEY `manual_refund_request_created_idx` (`request_id`,`created_at`),
  KEY `manual_refund_payment_idx` (`order_payment_id`),
  KEY `manual_refund_actor_idx` (`actor_id`),
  CONSTRAINT `manual_refund_request_fk` FOREIGN KEY (`request_id`) REFERENCES `after_sales_requests` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `manual_refund_payment_fk` FOREIGN KEY (`order_payment_id`) REFERENCES `order_payments` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `manual_refund_actor_fk` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `manual_refund_evidence_fk` FOREIGN KEY (`evidence_id`) REFERENCES `financial_evidence` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `manual_refund_currency_ck` CHECK (`currency` = 'VND' AND `amount_vnd` > 0)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `manual_refund_units` (
  `operation_id` INT NOT NULL,
  `order_item_id` INT NOT NULL,
  `unit_index` INT UNSIGNED NOT NULL,
  `net_vnd` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`operation_id`,`order_item_id`,`unit_index`),
  UNIQUE KEY `uq_manual_refund_order_unit` (`order_item_id`,`unit_index`),
  CONSTRAINT `manual_refund_units_operation_fk` FOREIGN KEY (`operation_id`) REFERENCES `manual_refund_operations` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `manual_refund_units_order_item_fk` FOREIGN KEY (`order_item_id`) REFERENCES `order_items` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
