ALTER TABLE orders
    ADD COLUMN delivered_at DATETIME NULL,
    ADD INDEX orders_delivered_at_idx (delivered_at);

UPDATE orders
SET delivered_at = date_added
WHERE status = 1 AND delivered_at IS NULL;

ALTER TABLE order_payments
    ADD COLUMN reconciliation_status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    ADD COLUMN provider_status VARCHAR(32) NULL,
    ADD COLUMN last_reconciled_at DATETIME NULL,
    ADD COLUMN last_reconciliation_error TEXT NULL,
    ADD INDEX order_payments_reconciliation_idx (reconciliation_status, last_reconciled_at);

CREATE TABLE payment_webhook_events (
    id INT NOT NULL AUTO_INCREMENT,
    provider VARCHAR(32) NOT NULL,
    event_key VARCHAR(255) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    payload_hash CHAR(64) NOT NULL,
    normalized_payload JSON NOT NULL,
    order_code BIGINT NULL,
    payment_link_id VARCHAR(255) NULL,
    amount DECIMAL(14,0) NULL,
    currency CHAR(3) NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'RECEIVED',
    attempt_count INT NOT NULL DEFAULT 0,
    last_error TEXT NULL,
    received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY payment_webhook_events_provider_key (provider, event_key),
    INDEX payment_webhook_events_status_received_idx (status, received_at),
    INDEX payment_webhook_events_provider_order_idx (provider, order_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE payment_reconciliation_attempts (
    id INT NOT NULL AUTO_INCREMENT,
    provider VARCHAR(32) NOT NULL,
    pending_checkout_id INT NULL,
    order_payment_id INT NULL,
    requested_by VARCHAR(255) NULL,
    outcome VARCHAR(24) NOT NULL,
    local_status VARCHAR(24) NULL,
    provider_status VARCHAR(32) NULL,
    expected_amount DECIMAL(14,0) NULL,
    provider_amount DECIMAL(14,0) NULL,
    expected_currency CHAR(3) NULL,
    provider_currency CHAR(3) NULL,
    provider_reference VARCHAR(255) NULL,
    mismatch_reason TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX payment_reconciliation_attempts_pending_idx (pending_checkout_id),
    INDEX payment_reconciliation_attempts_payment_idx (order_payment_id),
    INDEX payment_reconciliation_attempts_outcome_idx (outcome, created_at),
    CONSTRAINT payment_reconciliation_target_chk
        CHECK ((pending_checkout_id IS NULL) <> (order_payment_id IS NULL)),
    CONSTRAINT fk_reconciliation_pending_checkout
        FOREIGN KEY (pending_checkout_id) REFERENCES pending_checkouts (id),
    CONSTRAINT fk_reconciliation_order_payment
        FOREIGN KEY (order_payment_id) REFERENCES order_payments (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;