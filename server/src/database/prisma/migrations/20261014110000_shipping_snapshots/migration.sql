ALTER TABLE products
    ADD COLUMN parcel_grams INT NULL,
    ADD COLUMN parcel_length_cm INT NULL,
    ADD COLUMN parcel_width_cm INT NULL,
    ADD COLUMN parcel_height_cm INT NULL,
    ADD CONSTRAINT chk_product_parcel CHECK (
        (parcel_grams IS NULL AND parcel_length_cm IS NULL AND parcel_width_cm IS NULL AND parcel_height_cm IS NULL)
        OR (parcel_grams > 0 AND parcel_length_cm > 0 AND parcel_width_cm > 0 AND parcel_height_cm > 0
            AND parcel_grams IS NOT NULL AND parcel_length_cm IS NOT NULL AND parcel_width_cm IS NOT NULL AND parcel_height_cm IS NOT NULL)
    );
ALTER TABLE orders ADD COLUMN pricing_snapshot JSON NULL, ADD COLUMN delivery_snapshot JSON NULL;
ALTER TABLE pending_checkouts ADD COLUMN pricing_snapshot JSON NULL, ADD COLUMN delivery_snapshot JSON NULL;
CREATE TABLE delivery_quotes (
    id CHAR(36) NOT NULL PRIMARY KEY,
    fingerprint CHAR(64) NOT NULL,
    owner_hash CHAR(64) NOT NULL,
    provider VARCHAR(16) NOT NULL,
    service_type_id INT NOT NULL,
    address JSON NOT NULL,
    parcel JSON NOT NULL,
    pricing JSON NOT NULL,
    expected_delivery_at DATETIME(3) NULL,
    expires_at DATETIME(3) NOT NULL,
    consumed_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_delivery_quotes_owner (owner_hash, expires_at),
    KEY idx_delivery_quotes_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
