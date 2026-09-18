CREATE TABLE IF NOT EXISTS `wishlist_alert_preferences` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` varchar(255) NOT NULL,
  `product_id` int NOT NULL,
  `price_drop_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `back_in_stock_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `price_baseline` decimal(14,2) NOT NULL DEFAULT 0.00,
  `stock_available` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_wishlist_alert_user_product` (`user_id`, `product_id`),
  KEY `idx_wishlist_alert_product` (`product_id`),
  KEY `idx_wishlist_alert_price` (`product_id`, `price_drop_enabled`),
  KEY `idx_wishlist_alert_stock` (`product_id`, `back_in_stock_enabled`, `stock_available`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO `wishlist_alert_preferences`
  (`user_id`, `product_id`, `price_baseline`, `stock_available`)
SELECT
  wishlist.user_id,
  products.id,
  CASE WHEN products.sale_price IS NOT NULL
            AND products.sale_price > 0
            AND products.sale_price < products.price
       THEN products.sale_price ELSE products.price END,
  products.stock > 0
FROM `wishlist`
JOIN `products` ON products.id = wishlist.product_id;

ALTER TABLE `customer_notifications`
  ADD COLUMN `metadata` JSON NULL AFTER `link`;
