CREATE TABLE `admin_audit_events` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `actor_id` VARCHAR(255) NOT NULL,
    `action` VARCHAR(80) NOT NULL,
    `entity_type` VARCHAR(40) NOT NULL,
    `entity_id` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(500) NULL,
    `changes` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    INDEX `admin_audit_actor_created_idx` (`actor_id`, `created_at`),
    INDEX `admin_audit_entity_idx` (`entity_type`, `entity_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `admin_alert_states` (
    `admin_id` VARCHAR(255) NOT NULL,
    `alert_id` VARCHAR(191) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'ACKNOWLEDGED',
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`admin_id`, `alert_id`),
    INDEX `admin_alert_states_updated_idx` (`admin_id`, `updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `admin_alert_triage` (
    `alert_id` VARCHAR(191) NOT NULL,
    `assigned_admin_id` VARCHAR(255) NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'OPEN',
    `updated_by` VARCHAR(255) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    `resolved_at` DATETIME(3) NULL,
    PRIMARY KEY (`alert_id`),
    INDEX `admin_alert_triage_owner_idx` (`assigned_admin_id`, `status`),
    INDEX `admin_alert_triage_status_updated_idx` (`status`, `updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
