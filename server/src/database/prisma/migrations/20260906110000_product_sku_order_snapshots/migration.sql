ALTER TABLE `products`
    ADD COLUMN `sku` VARCHAR(64) NULL,
    ADD COLUMN `manufacturer_part_number` VARCHAR(128) NULL,
    ADD COLUMN `warranty_months` INT NULL;

UPDATE `products`
SET `sku` = CONCAT('DIG-', LPAD(`id`, 8, '0'))
WHERE `sku` IS NULL;

ALTER TABLE `products`
    MODIFY `sku` VARCHAR(64) NOT NULL,
    ADD UNIQUE KEY `uq_products_sku` (`sku`),
    ADD INDEX `products_mpn_idx` (`manufacturer_part_number`);

ALTER TABLE `order_items`
    ADD COLUMN `sku_snapshot` VARCHAR(64) NULL,
    ADD COLUMN `product_name_snapshot` VARCHAR(255) NULL,
    ADD COLUMN `image_snapshot` VARCHAR(255) NULL,
    ADD COLUMN `unit_price_snapshot` DECIMAL(11,2) NULL,
    ADD COLUMN `brand_snapshot` VARCHAR(255) NULL,
    ADD COLUMN `category_snapshot` VARCHAR(255) NULL,
    ADD COLUMN `warranty_months_snapshot` INT NULL,
    ADD COLUMN `specifications_snapshot` JSON NULL;
