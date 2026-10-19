CREATE TABLE `pending_checkouts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `stripe_session_id` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `user_id` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `cart_json` text COLLATE utf8mb4_general_ci NOT NULL,
  `total_price` decimal(11,2) NOT NULL,
  `discount` decimal(11,2) NOT NULL DEFAULT '0.00',
  `shipping_address` text COLLATE utf8mb4_general_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `consumed_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pending_checkouts_session` (`stripe_session_id`),
  KEY `idx_pending_checkouts_user` (`user_id`),
  CONSTRAINT `fk_pending_checkouts_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `chk_pending_checkouts_total_price` CHECK ((`total_price` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE `orders`
  ADD COLUMN `stripe_checkout_session_id` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL AFTER `payment_method`,
  ADD COLUMN `stripe_payment_intent_id` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL AFTER `stripe_checkout_session_id`;

ALTER TABLE `orders`
  ADD KEY `idx_orders_stripe_checkout_session` (`stripe_checkout_session_id`);
