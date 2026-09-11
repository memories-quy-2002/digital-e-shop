ALTER TABLE `categories`
    ADD COLUMN `slug` VARCHAR(120) NULL,
    ADD COLUMN `catalog_group` VARCHAR(80) NULL,
    ADD COLUMN `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    ADD COLUMN `sort_order` INT NOT NULL DEFAULT 100;

CREATE TABLE `category_aliases` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `alias_slug` VARCHAR(120) NOT NULL,
    `alias_name` VARCHAR(255) NOT NULL,
    `category_id` INT NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_category_aliases_slug` (`alias_slug`),
    UNIQUE KEY `uq_category_aliases_name` (`alias_name`),
    KEY `category_aliases_category_id_idx` (`category_id`),
    CONSTRAINT `fk_category_aliases_category`
        FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`)
        ON DELETE CASCADE ON UPDATE RESTRICT
);

CREATE TABLE `category_attribute_definitions` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `category_id` INT NOT NULL,
    `attribute_key` VARCHAR(120) NOT NULL,
    `label` VARCHAR(160) NOT NULL,
    `value_type` VARCHAR(16) NOT NULL,
    `unit` VARCHAR(32) NULL,
    `filterable` TINYINT(1) NOT NULL DEFAULT 1,
    `comparable` TINYINT(1) NOT NULL DEFAULT 1,
    `facet_order` INT NOT NULL DEFAULT 100,
    `comparison_order` INT NOT NULL DEFAULT 100,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_category_attribute_definition` (`category_id`, `attribute_key`),
    KEY `category_attribute_filter_idx` (`category_id`, `filterable`, `facet_order`),
    KEY `category_attribute_compare_idx` (`category_id`, `comparable`, `comparison_order`),
    CONSTRAINT `fk_category_attribute_definition_category`
        FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`)
        ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT `chk_category_attribute_value_type`
        CHECK (`value_type` IN ('text', 'number'))
);

UPDATE categories SET slug = 'laptops', catalog_group = 'Computers', sort_order = 10 WHERE name = 'Laptop';
UPDATE categories SET slug = 'desktops', catalog_group = 'Computers', sort_order = 20 WHERE name = 'Desktop';
UPDATE categories SET slug = 'pc-and-peripherals', catalog_group = 'Computers', sort_order = 30 WHERE name = 'PC';
UPDATE categories SET slug = 'graphics-cards', catalog_group = 'Computers', sort_order = 40 WHERE name = 'Graphics Card';
UPDATE categories SET slug = 'monitors', catalog_group = 'Displays', sort_order = 10 WHERE name = 'Monitor';
UPDATE categories SET slug = 'smartphones', catalog_group = 'Mobile', sort_order = 10 WHERE name = 'Smartphone';
UPDATE categories SET slug = 'headphones', catalog_group = 'Audio', sort_order = 10 WHERE name = 'Headphone';
UPDATE categories SET slug = 'speakers', catalog_group = 'Audio', sort_order = 20 WHERE name = 'Speaker';
UPDATE categories SET slug = 'consoles', catalog_group = 'Gaming', sort_order = 10 WHERE name = 'Console';
UPDATE categories SET slug = 'cameras', catalog_group = 'Cameras', sort_order = 10 WHERE name = 'Camera';

UPDATE categories
SET slug = CONCAT('legacy-', id), is_active = 0, sort_order = 1000
WHERE slug IS NULL;

ALTER TABLE categories
    MODIFY COLUMN slug VARCHAR(120) NOT NULL,
    ADD UNIQUE KEY uq_categories_slug (slug),
    ADD KEY categories_navigation_idx (is_active, catalog_group, sort_order);

INSERT INTO category_aliases (alias_slug, alias_name, category_id)
SELECT 'phone', 'Phone', id FROM categories WHERE slug = 'smartphones';

INSERT INTO category_aliases (alias_slug, alias_name, category_id)
SELECT 'gpu', 'GPU', id FROM categories WHERE slug = 'graphics-cards';

INSERT INTO category_aliases (alias_slug, alias_name, category_id)
SELECT 'headphones', 'Headphones', id FROM categories WHERE slug = 'headphones';
