ALTER TABLE `customer_addresses`
    ADD COLUMN `province_code` VARCHAR(32) NULL,
    ADD COLUMN `province_name` VARCHAR(120) NULL,
    ADD COLUMN `ward_code` VARCHAR(32) NULL,
    ADD COLUMN `ward_name` VARCHAR(120) NULL;
