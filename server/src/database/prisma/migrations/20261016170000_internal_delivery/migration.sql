ALTER TABLE `customer_addresses`
    ADD COLUMN `latitude` DECIMAL(10, 7) NULL,
    ADD COLUMN `longitude` DECIMAL(10, 7) NULL;

ALTER TABLE `delivery_quotes`
    MODIFY COLUMN `service_type_id` INT NULL,
    MODIFY COLUMN `parcel` JSON NULL,
    ADD COLUMN `origin_latitude` DECIMAL(10, 7) NULL,
    ADD COLUMN `origin_longitude` DECIMAL(10, 7) NULL,
    ADD COLUMN `destination_latitude` DECIMAL(10, 7) NULL,
    ADD COLUMN `destination_longitude` DECIMAL(10, 7) NULL,
    ADD COLUMN `distance_meters` BIGINT UNSIGNED NULL,
    ADD COLUMN `route_geometry` JSON NULL,
    ADD COLUMN `settings_version` INT UNSIGNED NULL;

CREATE TABLE `delivery_settings` (
    `id` TINYINT UNSIGNED NOT NULL,
    `store_address` VARCHAR(255) NULL,
    `store_latitude` DECIMAL(10, 7) NULL,
    `store_longitude` DECIMAL(10, 7) NULL,
    `fee_5_to_20_vnd` BIGINT UNSIGNED NULL,
    `fee_over_20_vnd` BIGINT UNSIGNED NULL,
    `routing_endpoint` VARCHAR(2048) NULL,
    `tile_url` VARCHAR(2048) NULL,
    `tile_attribution` VARCHAR(512) NULL,
    `version` INT UNSIGNED NOT NULL DEFAULT 0,
    `updated_by_id` VARCHAR(255) COLLATE utf8mb4_general_ci NULL,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    CONSTRAINT `fk_delivery_settings_updated_by` FOREIGN KEY (`updated_by_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `delivery_settings` (`id`, `version`) VALUES (1, 0);

CREATE TABLE `delivery_assignments` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `order_id` INT NOT NULL,
    `employee_id` VARCHAR(255) COLLATE utf8mb4_general_ci NOT NULL,
    `assigned_by_id` VARCHAR(255) COLLATE utf8mb4_general_ci NOT NULL,
    `scheduled_start_at` DATETIME(3) NOT NULL,
    `scheduled_end_at` DATETIME(3) NOT NULL,
    `status` VARCHAR(24) NOT NULL DEFAULT 'ASSIGNED',
    `failure_reason` VARCHAR(500) NULL,
    `attempt_number` INT UNSIGNED NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    KEY `idx_delivery_assignments_employee_schedule` (`employee_id`, `status`, `scheduled_start_at`, `scheduled_end_at`),
    KEY `idx_delivery_assignments_order_status` (`order_id`, `status`, `id`),
    CONSTRAINT `fk_delivery_assignment_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
    CONSTRAINT `fk_delivery_assignment_employee` FOREIGN KEY (`employee_id`) REFERENCES `users` (`id`),
    CONSTRAINT `fk_delivery_assignment_admin` FOREIGN KEY (`assigned_by_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `delivery_events` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `assignment_id` INT NOT NULL,
    `order_id` INT NOT NULL,
    `event_type` VARCHAR(32) NOT NULL,
    `status` VARCHAR(24) NULL,
    `actor_id` VARCHAR(255) COLLATE utf8mb4_general_ci NULL,
    `public_note` VARCHAR(500) NULL,
    `details` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    KEY `idx_delivery_events_assignment` (`assignment_id`, `id`),
    KEY `idx_delivery_events_order` (`order_id`, `id`),
    CONSTRAINT `fk_delivery_event_assignment` FOREIGN KEY (`assignment_id`) REFERENCES `delivery_assignments` (`id`),
    CONSTRAINT `fk_delivery_event_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
    CONSTRAINT `fk_delivery_event_actor` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
