ALTER TABLE `pending_checkouts`
    ADD COLUMN `payment_provider` VARCHAR(32) NULL,
    ADD COLUMN `provider_reference` VARCHAR(255) NULL,
    ADD COLUMN `provider_order_code` BIGINT NULL,
    ADD COLUMN `payment_amount` DECIMAL(14,2) NULL,
    ADD COLUMN `payment_currency` CHAR(3) NULL,
    ADD COLUMN `payment_fx_rate` DECIMAL(18,6) NOT NULL DEFAULT 1,
    ADD UNIQUE KEY `uq_pending_checkouts_provider_reference` (`payment_provider`, `provider_reference`),
    ADD UNIQUE KEY `uq_pending_checkouts_provider_order_code` (`payment_provider`, `provider_order_code`);
