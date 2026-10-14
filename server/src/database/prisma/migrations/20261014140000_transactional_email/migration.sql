CREATE TABLE transactional_emails (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    event_key VARCHAR(191) COLLATE utf8mb4_bin NOT NULL,
    event_type VARCHAR(40) NOT NULL,
    recipient VARCHAR(254) NOT NULL,
    locale VARCHAR(2) NOT NULL,
    subject TEXT NOT NULL,
    text_body MEDIUMTEXT NOT NULL,
    html_body MEDIUMTEXT NOT NULL,
    snapshot JSON NOT NULL,
    content_hash CHAR(64) NOT NULL,
    state VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    provider_message_id VARCHAR(191) NULL,
    accepted_at DATETIME(3) NULL,
    delivered_at DATETIME(3) NULL,
    bounced_at DATETIME(3) NULL,
    last_error_code VARCHAR(80) NULL,
    resend_of_id INT NULL,
    created_by_admin_id VARCHAR(255) COLLATE utf8mb4_general_ci NULL,
    unknown_outcome_acknowledged TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_transactional_email_event (event_key),
    UNIQUE KEY uq_transactional_email_provider (provider_message_id),
    KEY idx_transactional_email_state (state, id),
    KEY idx_transactional_email_resend_of (resend_of_id),
    KEY idx_transactional_email_admin (created_by_admin_id),
    CONSTRAINT fk_transactional_email_resend_of FOREIGN KEY (resend_of_id) REFERENCES transactional_emails(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_transactional_email_admin FOREIGN KEY (created_by_admin_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE email_delivery_events (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    provider_event_id VARCHAR(191) COLLATE utf8mb4_bin NOT NULL,
    email_id INT NOT NULL,
    provider_message_id VARCHAR(191) NOT NULL,
    event_type VARCHAR(40) NOT NULL,
    payload_hash CHAR(64) COLLATE ascii_bin NOT NULL,
    received_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_email_delivery_event_provider (provider_event_id),
    KEY idx_email_delivery_event_email (email_id, received_at),
    KEY idx_email_delivery_event_message (provider_message_id),
    CONSTRAINT fk_email_delivery_event_email FOREIGN KEY (email_id) REFERENCES transactional_emails(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE orders ADD COLUMN contact_snapshot JSON NULL;
ALTER TABLE pending_checkouts ADD COLUMN contact_snapshot JSON NULL;
