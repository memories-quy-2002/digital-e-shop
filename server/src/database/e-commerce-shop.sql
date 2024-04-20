-- phpMyAdmin SQL Dump
-- version 5.2.0
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Apr 19, 2024 at 07:14 AM
-- Server version: 10.4.27-MariaDB
-- PHP Version: 8.1.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `e-commerce-shop`
--

-- --------------------------------------------------------

--
-- Table structure for table `brands`
--

CREATE TABLE `brands` (
  `id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `brands`
--

INSERT INTO `brands` (`id`, `name`) VALUES
(14, 'AMD'),
(5, 'Apple'),
(9, 'Bose'),
(4, 'Dell'),
(8, 'Google'),
(6, 'HP'),
(11, 'JBL'),
(2, 'LG'),
(12, 'Microsoft'),
(7, 'MSI'),
(13, 'Nvidia'),
(1, 'Samsung'),
(10, 'Sonos'),
(3, 'Sony');

-- --------------------------------------------------------

--
-- Table structure for table `cart`
--

CREATE TABLE `cart` (
  `id` int(11) NOT NULL,
  `user_id` varchar(255) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `done` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `cart`
--

INSERT INTO `cart` (`id`, `user_id`, `created_at`, `done`) VALUES
(3, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-03-06 18:33:42', 1),
(4, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-04-19 08:29:24', 1),
(5, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-04-19 11:32:57', 0);

-- --------------------------------------------------------

--
-- Table structure for table `cart_items`
--

CREATE TABLE `cart_items` (
  `id` int(11) NOT NULL,
  `cart_id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `quantity` int(11) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `cart_items`
--

INSERT INTO `cart_items` (`id`, `cart_id`, `product_id`, `quantity`, `created_at`) VALUES
(11, 3, 5, 1, '2024-03-06 18:47:05'),
(12, 4, 1, 1, '2024-04-19 08:30:01'),
(13, 4, 4, 2, '2024-04-19 08:30:11'),
(15, 4, 5, 1, '2024-04-19 08:37:16'),
(16, 4, 8, 1, '2024-04-19 08:37:18'),
(17, 5, 23, 1, '2024-04-19 11:32:57'),
(18, 5, 25, 1, '2024-04-19 11:33:02'),
(20, 5, 26, 1, '2024-04-19 11:33:05');

-- --------------------------------------------------------

--
-- Table structure for table `categories`
--

CREATE TABLE `categories` (
  `id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `categories`
--

INSERT INTO `categories` (`id`, `name`) VALUES
(5, 'Appliance'),
(8, 'Console'),
(3, 'Desktop'),
(9, 'Graphics Card'),
(11, 'Headphone'),
(7, 'Home Theater System'),
(2, 'Laptop'),
(10, 'Other'),
(4, 'Smartphone'),
(6, 'Speaker'),
(1, 'Television');

-- --------------------------------------------------------

--
-- Table structure for table `products`
--

CREATE TABLE `products` (
  `id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `category_id` int(11) NOT NULL,
  `brand_id` int(11) NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `sale_price` decimal(10,2) DEFAULT NULL,
  `stock` int(11) NOT NULL DEFAULT 0,
  `main_image` varchar(255) DEFAULT NULL,
  `image_gallery` text DEFAULT NULL,
  `specifications` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`specifications`)),
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp(),
  `rating` decimal(2,1) NOT NULL DEFAULT 0.0,
  `reviews` int(11) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `products`
--

INSERT INTO `products` (`id`, `name`, `description`, `category_id`, `brand_id`, `price`, `sale_price`, `stock`, `main_image`, `image_gallery`, `specifications`, `created_at`, `updated_at`, `rating`, `reviews`) VALUES
(1, 'Samsung QN900B Neo QLED 8K Smart TV', '', 1, 1, '2217.85', NULL, 3, '', NULL, NULL, '2024-03-02 17:57:16', '2024-03-02 17:57:16', '0.0', 0),
(2, 'LG G2 OLED evo Gallery Edition TV', '', 1, 2, '3199.99', NULL, 2, '', NULL, NULL, '2024-03-02 17:57:57', '2024-03-02 17:57:57', '0.0', 0),
(3, 'Sony Bravia XR A95K OLED 4K Smart TV', '', 1, 3, '3499.99', NULL, 4, '', NULL, NULL, '2024-03-02 18:00:17', '2024-03-02 18:00:17', '0.0', 0),
(4, 'Dell XPS 13 OLED 9320', '', 2, 4, '999.00', NULL, 2, '', NULL, NULL, '2024-03-02 18:00:55', '2024-03-02 18:00:55', '0.0', 0),
(5, 'HP Spectre x360 14-ef0023dx', '', 2, 6, '679.99', NULL, 2, '', NULL, NULL, '2024-03-02 18:05:22', '2024-03-02 18:05:22', '0.0', 0),
(6, 'Apple MacBook Air M2', '', 2, 5, '1299.00', NULL, 2, '', NULL, NULL, '2024-03-02 18:05:59', '2024-03-02 18:05:59', '0.0', 0),
(7, 'MSI MEG Trident X Gaming Desktop', '', 3, 7, '5699.00', NULL, 0, '', NULL, NULL, '2024-03-02 18:06:36', '2024-03-02 18:06:36', '0.0', 0),
(8, 'iPhone 14 Pro Max', '', 4, 5, '799.00', NULL, 13, '', NULL, NULL, '2024-03-02 18:08:23', '2024-03-02 18:08:23', '0.0', 0),
(9, 'Samsung Galaxy S23 Ultra', '', 4, 1, '1099.99', NULL, 13, '', NULL, NULL, '2024-03-02 18:08:56', '2024-03-02 18:08:56', '0.0', 0),
(10, 'Sony WH-1000XM5 Wireless Noise-Cancelling Headphones', '', 11, 3, '279.49', NULL, 7, '', NULL, NULL, '2024-03-02 18:10:24', '2024-03-02 18:10:24', '0.0', 0),
(11, 'Bose QuietComfort 45 Headphones', '', 11, 9, '279.00', NULL, 7, '', NULL, NULL, '2024-03-02 18:10:58', '2024-03-02 18:10:58', '0.0', 0),
(12, 'Sonos Arc Soundbar', '', 6, 10, '814.50', NULL, 3, '', NULL, NULL, '2024-03-02 18:11:48', '2024-03-02 18:11:48', '0.0', 0),
(13, 'JBL Flip 5 Portable Bluetooth Speaker', '', 6, 11, '79.93', NULL, 1, '', NULL, NULL, '2024-03-02 18:12:19', '2024-03-02 18:12:19', '0.0', 0),
(14, 'Nvidia GeForce RTX 3080', '', 9, 13, '519.00', NULL, 10, '', NULL, NULL, '2024-03-02 18:16:46', '2024-03-02 18:16:46', '0.0', 0),
(15, 'Microsoft Xbox Series X', '', 8, 12, '448.00', NULL, 1, '', NULL, NULL, '2024-03-02 18:15:56', '2024-03-02 18:15:56', '0.0', 0),
(16, 'Wireless Headphones (Sony)', 'Active noise-canceling headphones for clear and immersive audio.', 11, 3, '199.99', '179.99', 100, '', NULL, '{\"driver_size\": \"40mm\", \"bluetooth_version\": \"5.0\", \"battery_life\": \"20 hours\"}', '2024-04-18 00:00:00', '2024-04-18 00:00:00', '4.5', 23),
(17, 'Smartwatch (Samsung)', 'Fitness tracker with heart rate monitoring, GPS, and built-in notifications.', 2, 1, '249.99', '224.99', 50, '', NULL, '{\"display\": \"1.3 inch AMOLED\", \"water_resistance\": \"5 ATM\", \"storage\": \"4GB\"}', '2024-04-17 00:00:00', '2024-04-18 00:00:00', '4.2', 117),
(18, 'Gaming Laptop (Dell)', 'High-performance laptop for demanding games and applications.', 3, 4, '1499.99', '0.00', 25, '', NULL, '{\"processor\": \"Intel Core i7-13700H\", \"graphics_card\": \"NVIDIA GeForce RTX 3070\", \"ram\": \"16GB DDR5\"}', '2024-04-16 00:00:00', '2024-04-18 00:00:00', '4.8', 32),
(19, 'Wireless Speaker (Bose)', 'Portable Bluetooth speaker with rich sound and long battery life.', 6, 9, '79.99', '69.99', 150, '', NULL, '{\"power\": \"20W\", \"connectivity\": \"Bluetooth 5.2\", \"battery_life\": \"12 hours\"}', '2024-04-15 00:00:00', '2024-04-18 00:00:00', '4.1', 84),
(20, 'Smart TV (LG)', '4K UHD TV with HDR and built-in smart features.', 1, 2, '599.99', '499.99', 75, '', NULL, '{\"screen_size\": \"55 inches\", \"resolution\": \"3840x2160\", \"hdr\": \"HDR10+\"}', '2024-04-14 00:00:00', '2024-04-18 00:00:00', '4.7', 121),
(21, 'Noise-Canceling Earbuds (Sony)', 'Compact earbuds with active noise cancellation for on-the-go listening.', 11, 3, '99.99', '89.99', 200, '', NULL, '{\"driver_size\": \"10mm\", \"bluetooth_version\": \"5.2\", \"battery_life\": \"8 hours\"}', '2024-04-13 00:00:00', '2024-04-18 00:00:00', '4.3', 58),
(22, 'Smartphone (Apple)', 'Flagship smartphone with a powerful camera and advanced iOS features.', 4, 5, '999.99', '899.99', 100, '', NULL, '{\"display\": \"6.7 inch Super Retina XDR\", \"processor\": \"A15 Bionic\", \"storage\": \"512GB\"}', '2024-04-19 00:00:00', '2024-04-19 00:00:00', '4.9', 65),
(23, 'DSLR Camera (Canon)', 'Professional-grade camera with high-resolution sensor and versatile shooting modes.', 5, 6, '1499.99', '1349.99', 50, '', NULL, '{\"sensor\": \"20.1MP CMOS\", \"ISO_range\": \"100-25600\", \"video_resolution\": \"4K UHD\"}', '2024-04-19 00:00:00', '2024-04-19 00:00:00', '4.6', 78),
(24, 'Tablet (Microsoft)', 'Versatile tablet with a detachable keyboard and Windows operating system.', 7, 8, '699.99', '629.99', 80, '', NULL, '{\"display\": \"12.3 inch PixelSense\", \"processor\": \"Intel Core i5\", \"storage\": \"256GB\"}', '2024-04-19 00:00:00', '2024-04-19 00:00:00', '4.4', 93),
(25, 'Wireless Mouse (Logitech)', 'Ergonomic wireless mouse with customizable buttons and long battery life.', 8, 10, '49.99', '39.99', 120, '', NULL, '{\"connectivity\": \"2.4GHz wireless\", \"battery_life\": \"24 months\"}', '2024-04-20 00:00:00', '2024-04-20 00:00:00', '4.2', 52),
(26, 'Home Security Camera (Ring)', 'HD security camera with motion detection and two-way audio.', 9, 11, '129.99', '109.99', 60, '', NULL, '{\"resolution\": \"1080p HD\", \"field_of_view\": \"140 degrees\", \"night_vision\": \"Infrared\"}', '2024-04-20 00:00:00', '2024-04-20 00:00:00', '4.7', 38);

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `username` varchar(16) NOT NULL,
  `first_name` text DEFAULT NULL,
  `last_name` text DEFAULT NULL,
  `role` varchar(16) NOT NULL,
  `token` varchar(255) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `last_login` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `email`, `password`, `username`, `first_name`, `last_name`, `role`, `token`, `created_at`, `last_login`) VALUES
('ljul8hizGLbsDwKUIjHIJYXCnFF3', 'test1@gmail.com', '$2b$10$hI67QaYzryi9sCUz7y34Suip3fMIx2rrFvQnraE6BKRR9MFc/tHsG', 'memories2002', NULL, NULL, 'Customer', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImxqdWw4aGl6R0xic0R3S1VJakhJSllYQ25GRjMiLCJlbWFpbCI6InRlc3QxQGdtYWlsLmNvbSIsImlhdCI6MTcwOTM0OTk4MSwiZXhwIjoxNzExOTQxOTgxfQ.7za82_X9r0uBYLPnzPTCa5QqThLsxnFlmjX2de3EoZI', '2024-03-02 10:26:21', '2024-04-19 07:49:23');

-- --------------------------------------------------------

--
-- Table structure for table `wishlist`
--

CREATE TABLE `wishlist` (
  `id` int(11) NOT NULL,
  `user_id` varchar(255) NOT NULL,
  `product_id` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `wishlist`
--

INSERT INTO `wishlist` (`id`, `user_id`, `product_id`) VALUES
(7, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 2),
(6, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 3),
(4, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 5),
(10, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 7),
(21, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 10),
(17, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 11),
(19, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 12),
(9, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 13),
(18, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 15),
(22, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 23);

--
-- Indexes for dumped tables
--

--
-- Indexes for table `brands`
--
ALTER TABLE `brands`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `name` (`name`);

--
-- Indexes for table `cart`
--
ALTER TABLE `cart`
  ADD PRIMARY KEY (`id`,`user_id`) USING BTREE,
  ADD KEY `FK_CartUser` (`user_id`);

--
-- Indexes for table `cart_items`
--
ALTER TABLE `cart_items`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `cart_id` (`cart_id`,`product_id`),
  ADD KEY `FK_CartItemProduct` (`product_id`);

--
-- Indexes for table `categories`
--
ALTER TABLE `categories`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `name` (`name`);

--
-- Indexes for table `products`
--
ALTER TABLE `products`
  ADD PRIMARY KEY (`id`),
  ADD KEY `FK_ProductCategory` (`category_id`),
  ADD KEY `FK_ProductBrand` (`brand_id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `username` (`username`),
  ADD UNIQUE KEY `email` (`email`) USING BTREE;

--
-- Indexes for table `wishlist`
--
ALTER TABLE `wishlist`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `UC_Wishlist` (`user_id`,`product_id`),
  ADD KEY `FK_WishlistProduct` (`product_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `brands`
--
ALTER TABLE `brands`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=15;

--
-- AUTO_INCREMENT for table `cart`
--
ALTER TABLE `cart`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `cart_items`
--
ALTER TABLE `cart_items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=21;

--
-- AUTO_INCREMENT for table `categories`
--
ALTER TABLE `categories`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=12;

--
-- AUTO_INCREMENT for table `wishlist`
--
ALTER TABLE `wishlist`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=23;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `cart`
--
ALTER TABLE `cart`
  ADD CONSTRAINT `FK_CartUser` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);

--
-- Constraints for table `cart_items`
--
ALTER TABLE `cart_items`
  ADD CONSTRAINT `FK_CartItemCart` FOREIGN KEY (`cart_id`) REFERENCES `cart` (`id`),
  ADD CONSTRAINT `FK_CartItemProduct` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`);

--
-- Constraints for table `products`
--
ALTER TABLE `products`
  ADD CONSTRAINT `FK_ProductBrand` FOREIGN KEY (`brand_id`) REFERENCES `brands` (`id`),
  ADD CONSTRAINT `FK_ProductCategory` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`);

--
-- Constraints for table `wishlist`
--
ALTER TABLE `wishlist`
  ADD CONSTRAINT `FK_WishlistProduct` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  ADD CONSTRAINT `FK_WishlistUser` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
