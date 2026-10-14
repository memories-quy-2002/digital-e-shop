CREATE TABLE sandbox_carrier_shipments (
    client_reference VARCHAR(50) COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
    provider_order_code VARCHAR(100) NOT NULL UNIQUE,
    input_hash CHAR(64) NOT NULL,
    snapshot JSON NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
