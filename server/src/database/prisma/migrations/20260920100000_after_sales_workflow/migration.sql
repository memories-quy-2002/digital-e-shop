CREATE TABLE after_sales_requests (
    id INT NOT NULL AUTO_INCREMENT,
    order_id INT NOT NULL,
    user_id VARCHAR(255) NULL,
    guest_order_token_hash CHAR(64) NULL,
    kind VARCHAR(16) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'REQUESTED',
    reason TEXT NOT NULL,
    admin_note TEXT NULL,
    request_idempotency_key VARCHAR(128) NOT NULL,
    refund_amount DECIMAL(14,2) NULL,
    refund_currency CHAR(3) NULL,
    refund_reference VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approved_at DATETIME NULL,
    received_at DATETIME NULL,
    refunded_at DATETIME NULL,
    closed_at DATETIME NULL,
    PRIMARY KEY (id),
    UNIQUE KEY after_sales_requests_idempotency_key (request_idempotency_key),
    INDEX after_sales_requests_order_status_idx (order_id, status, created_at),
    INDEX after_sales_requests_user_created_idx (user_id, created_at),
    INDEX after_sales_requests_guest_order_idx (order_id, guest_order_token_hash),
    INDEX after_sales_requests_queue_idx (status, kind, created_at),
    CONSTRAINT fk_after_sales_requests_order
        FOREIGN KEY (order_id) REFERENCES orders (id),
    CONSTRAINT fk_after_sales_requests_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE after_sales_items (
    id INT NOT NULL AUTO_INCREMENT,
    request_id INT NOT NULL,
    order_item_id INT NOT NULL,
    quantity INT NOT NULL,
    reason TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY after_sales_items_request_order_item (request_id, order_item_id),
    INDEX after_sales_items_order_item_idx (order_item_id),
    CONSTRAINT after_sales_items_quantity_chk CHECK (quantity > 0),
    CONSTRAINT fk_after_sales_items_request
        FOREIGN KEY (request_id) REFERENCES after_sales_requests (id),
    CONSTRAINT fk_after_sales_items_order_item
        FOREIGN KEY (order_item_id) REFERENCES order_items (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE after_sales_events (
    id INT NOT NULL AUTO_INCREMENT,
    request_id INT NOT NULL,
    from_status VARCHAR(24) NULL,
    to_status VARCHAR(24) NOT NULL,
    actor_user_id VARCHAR(255) NULL,
    note TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX after_sales_events_request_created_idx (request_id, created_at, id),
    INDEX after_sales_events_actor_created_idx (actor_user_id, created_at),
    CONSTRAINT fk_after_sales_events_request
        FOREIGN KEY (request_id) REFERENCES after_sales_requests (id),
    CONSTRAINT fk_after_sales_events_actor
        FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
