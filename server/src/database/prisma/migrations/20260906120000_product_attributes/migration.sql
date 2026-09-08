CREATE TABLE `product_attributes` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `product_id` INT NOT NULL,
    `attribute_key` VARCHAR(80) NOT NULL,
    `label` VARCHAR(120) NOT NULL,
    `value_type` VARCHAR(16) NOT NULL,
    `text_value` VARCHAR(255) NULL,
    `number_value` DECIMAL(18,4) NULL,
    `unit` VARCHAR(32) NULL,
    `filterable` TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_product_attributes_product_key` (`product_id`, `attribute_key`),
    INDEX `product_attributes_text_filter_idx` (`attribute_key`, `text_value`),
    INDEX `product_attributes_number_filter_idx` (`attribute_key`, `number_value`),
    CONSTRAINT `fk_product_attributes_product`
        FOREIGN KEY (`product_id`) REFERENCES `products`(`id`)
        ON DELETE CASCADE
);
