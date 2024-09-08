-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Sep 08, 2024 at 06:32 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

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
-- Creation: Aug 29, 2024 at 05:06 AM
--

CREATE TABLE `brands` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `brands`:
--

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
(15, 'Intel'),
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
-- Creation: Mar 06, 2024 at 11:19 AM
--

CREATE TABLE `cart` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` VARCHAR(255) NOT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `done` TINYINT(1) NOT NULL DEFAULT 0,
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `cart`:
--   `user_id`
--       `users` -> `id`
--

--
-- Dumping data for table `cart`
--

INSERT INTO `cart` (`id`, `user_id`, `created_at`, `done`) VALUES
(83, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-08-07 18:20:57', 1),
(85, '99rQgkUMyddb77MVZ0nEcn0BQwH2', '2024-08-08 12:12:36', 1),
(86, '99rQgkUMyddb77MVZ0nEcn0BQwH2', '2024-08-10 12:17:30', 1),
(87, '99rQgkUMyddb77MVZ0nEcn0BQwH2', '2024-08-10 12:24:46', 1),
(88, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-08-10 12:38:15', 1),
(89, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-08-10 12:41:20', 1),
(90, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-08-10 12:43:53', 1),
(91, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-08-10 12:45:57', 1),
(92, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-08-10 12:47:03', 1),
(93, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-08-10 12:49:08', 1),
(94, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-08-10 12:49:56', 1),
(95, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-08-10 12:51:34', 1),
(96, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-08-11 09:41:21', 1),
(97, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-08-11 11:19:51', 1),
(98, 'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1', '2024-08-25 10:51:35', 0),
(99, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-08-25 10:58:44', 0),
(100, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-08-25 11:29:51', 1),
(101, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-08-25 11:46:50', 1),
(102, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-09-04 11:15:04', 1),
(103, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-09-07 13:21:09', 1),
(104, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-09-07 16:29:15', 0);

-- --------------------------------------------------------

--
-- Table structure for table `cart_items`
--
-- Creation: May 28, 2024 at 05:32 AM
--

CREATE TABLE `cart_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `cart_id` INT NOT NULL,
  `product_id` INT NOT NULL,
  `quantity` INT NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `cart_items`:
--   `cart_id`
--       `cart` -> `id`
--   `product_id`
--       `products` -> `id`
--

--
-- Dumping data for table `cart_items`
--

INSERT INTO `cart_items` (`id`, `cart_id`, `product_id`, `quantity`, `created_at`) VALUES
(305, 83, 20, 4, '2024-08-07 18:31:15'),
(321, 85, 21, 1, '2024-08-10 12:13:48'),
(322, 86, 21, 2, '2024-08-10 12:17:30'),
(324, 87, 21, 1, '2024-08-10 12:24:46'),
(325, 87, 17, 2, '2024-08-10 12:24:46'),
(326, 87, 4, 1, '2024-08-10 12:24:47'),
(328, 83, 7, 1, '2024-08-10 12:32:11'),
(329, 83, 10, 1, '2024-08-10 12:32:12'),
(330, 88, 26, 1, '2024-08-10 12:38:15'),
(331, 88, 10, 1, '2024-08-10 12:38:16'),
(332, 88, 20, 1, '2024-08-10 12:38:17'),
(333, 89, 21, 4, '2024-08-10 12:41:20'),
(337, 89, 15, 4, '2024-08-10 12:41:21'),
(341, 90, 21, 3, '2024-08-10 12:43:53'),
(344, 91, 7, 1, '2024-08-10 12:45:58'),
(345, 91, 10, 1, '2024-08-10 12:45:58'),
(346, 91, 20, 1, '2024-08-10 12:45:59'),
(347, 92, 7, 1, '2024-08-10 12:47:03'),
(348, 92, 10, 1, '2024-08-10 12:47:04'),
(349, 93, 10, 1, '2024-08-10 12:49:08'),
(350, 93, 20, 1, '2024-08-10 12:49:08'),
(351, 94, 10, 1, '2024-08-10 12:49:56'),
(352, 95, 10, 1, '2024-08-10 12:51:34'),
(353, 95, 20, 1, '2024-08-10 12:51:34'),
(354, 95, 7, 1, '2024-08-10 12:51:34'),
(355, 96, 15, 1, '2024-08-11 09:41:21'),
(356, 96, 17, 2, '2024-08-11 09:41:22'),
(358, 96, 7, 1, '2024-08-11 09:48:50'),
(359, 97, 17, 1, '2024-08-11 11:19:51'),
(360, 97, 5, 2, '2024-08-11 11:23:12'),
(361, 97, 4, 1, '2024-08-11 11:23:13'),
(362, 98, 15, 1, '2024-08-25 10:51:35'),
(363, 98, 17, 1, '2024-08-25 10:51:35'),
(364, 98, 5, 1, '2024-08-25 10:51:38'),
(365, 97, 18, 1, '2024-08-25 10:58:19'),
(366, 97, 23, 1, '2024-08-25 10:58:19'),
(367, 97, 13, 1, '2024-08-25 10:58:21'),
(369, 99, 21, 1, '2024-08-25 10:58:44'),
(370, 99, 16, 1, '2024-08-25 10:58:45'),
(371, 99, 26, 1, '2024-08-25 10:58:45'),
(372, 99, 17, 1, '2024-08-25 10:58:46'),
(378, 100, 25, 1, '2024-08-25 11:29:51'),
(379, 100, 9, 1, '2024-08-25 11:29:52'),
(380, 100, 23, 1, '2024-08-25 11:29:54'),
(381, 100, 13, 1, '2024-08-25 11:30:00'),
(382, 100, 20, 1, '2024-08-25 11:44:57'),
(383, 100, 4, 1, '2024-08-25 11:44:59'),
(384, 101, 15, 6, '2024-08-25 11:46:50'),
(387, 101, 17, 1, '2024-08-25 11:47:25'),
(392, 101, 16, 1, '2024-08-25 12:10:26'),
(393, 101, 7, 1, '2024-08-26 12:47:51'),
(396, 102, 16, 1, '2024-09-07 12:48:43'),
(397, 102, 7, 1, '2024-09-07 12:48:44'),
(398, 102, 25, 2, '2024-09-07 12:55:07'),
(399, 103, 16, 3, '2024-09-07 13:21:09'),
(402, 104, 25, 2, '2024-09-07 16:29:15'),
(403, 104, 21, 1, '2024-09-07 16:29:27');

-- --------------------------------------------------------

--
-- Table structure for table `categories`
--
-- Creation: Aug 29, 2024 at 05:06 AM
--

CREATE TABLE `categories` (
  `id` int(11) NOT NULL AUTO INCREMENT PRIMARY KEY
  `name` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `categories`:
--

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
(12, 'PC'),
(4, 'Smartphone'),
(6, 'Speaker'),
(1, 'Television');

-- --------------------------------------------------------

--
-- Table structure for table `customer_sessions`
--
-- Creation: Aug 22, 2024 at 04:06 AM
--

CREATE TABLE `customer_sessions` (
  `id` int(11) NOT NULL,
  `user_id` varchar(255) DEFAULT NULL,
  `session_start` datetime DEFAULT NULL,
  `session_end` datetime DEFAULT NULL,
  `session_duration` int(11) DEFAULT NULL,
  `session_month` int(11) DEFAULT NULL,
  `session_year` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `customer_sessions`:
--   `user_id`
--       `users` -> `id`
--

--
-- Dumping data for table `customer_sessions`
--

INSERT INTO `customer_sessions` (`id`, `user_id`, `session_start`, `session_end`, `session_duration`, `session_month`, `session_year`) VALUES
(107, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-08-23 16:54:35', '2024-08-23 16:56:50', 135, 8, 2024),
(108, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-08-23 16:57:54', '2024-08-23 16:58:47', 53, 8, 2024),
(109, 'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1', '2024-08-23 17:00:17', NULL, NULL, 8, 2024),
(110, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-08-23 17:00:37', '2024-08-23 17:02:20', 103, 8, 2024),
(111, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-08-23 17:10:11', '2024-08-23 17:10:15', 4, 8, 2024),
(112, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-08-23 17:11:33', '2024-08-23 17:11:39', 6, 8, 2024),
(113, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-08-23 17:15:12', '2024-08-23 17:15:14', 2, 8, 2024),
(114, 'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1', '2024-08-25 09:27:26', NULL, NULL, 8, 2024),
(115, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-08-25 10:51:30', NULL, NULL, 8, 2024),
(117, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-08-25 11:29:35', '2024-08-25 11:29:41', 6, 8, 2024),
(118, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-08-25 11:29:48', '2024-08-26 12:49:40', 91192, 8, 2024),
(119, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-08-26 12:49:52', '2024-08-29 10:04:27', 249275, 8, 2024),
(120, 'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1', '2024-08-29 10:04:46', NULL, NULL, 8, 2024),
(121, 'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1', '2024-08-29 10:48:18', '2024-09-03 11:04:32', 432974, 8, 2024),
(122, 'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1', '2024-09-03 11:05:22', NULL, NULL, 9, 2024),
(123, 'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1', '2024-09-03 11:05:40', NULL, NULL, 9, 2024),
(124, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-09-03 11:19:25', NULL, NULL, 9, 2024),
(125, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-09-04 09:33:02', '2024-09-04 09:35:00', 118, 9, 2024),
(126, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-09-04 09:55:29', '2024-09-04 11:30:06', 5677, 9, 2024),
(127, 'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1', '2024-09-05 19:35:25', NULL, NULL, 9, 2024),
(128, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-09-07 12:48:35', NULL, NULL, 9, 2024),
(129, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-09-07 13:01:30', NULL, NULL, 9, 2024),
(130, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-09-07 13:17:19', NULL, NULL, 9, 2024),
(131, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-09-07 13:21:04', '2024-09-07 13:21:16', 12, 9, 2024),
(132, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-09-07 16:08:24', NULL, NULL, 9, 2024),
(133, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-09-07 16:52:23', NULL, NULL, 9, 2024),
(134, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-09-07 16:52:35', NULL, NULL, 9, 2024),
(135, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-09-07 17:04:11', NULL, NULL, 9, 2024),
(136, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-09-07 17:21:38', NULL, NULL, 9, 2024),
(137, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-09-08 09:42:39', NULL, NULL, 9, 2024);

-- --------------------------------------------------------

--
-- Table structure for table `discount`
--
-- Creation: Aug 05, 2024 at 02:38 AM
--

CREATE TABLE `discount` (
  `discount_id` int(11) NOT NULL,
  `discount_code` varchar(50) NOT NULL,
  `description` text DEFAULT NULL,
  `discount_percent` decimal(5,2) NOT NULL CHECK (`discount_percent` >= 0 and `discount_percent` <= 100),
  `start_date` date NOT NULL,
  `end_date` date NOT NULL CHECK (`end_date` >= `start_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `discount`:
--

--
-- Dumping data for table `discount`
--

INSERT INTO `discount` (`discount_id`, `discount_code`, `description`, `discount_percent`, `start_date`, `end_date`) VALUES
(1, 'SUMMER10', '10% off for summer sale', 10.00, '2024-07-01', '2024-08-31'),
(2, 'HOLIDAY20', '20% off for holiday season', 20.00, '2024-12-01', '2025-01-15'),
(3, 'NEWCUSTOMER15', '15% off for new customers', 15.00, '2024-07-01', '2024-12-31');

-- --------------------------------------------------------

--
-- Table structure for table `orders`
--
-- Creation: Aug 10, 2024 at 05:19 AM
--

CREATE TABLE `orders` (
  `id` int(11) NOT NULL,
  `date_added` datetime NOT NULL DEFAULT current_timestamp(),
  `user_id` varchar(255) NOT NULL,
  `status` int(1) NOT NULL DEFAULT 0,
  `total_price` decimal(11,2) NOT NULL DEFAULT 0.00,
  `discount` decimal(11,2) NOT NULL DEFAULT 0.00,
  `subtotal` decimal(11,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `orders`:
--   `user_id`
--       `users` -> `id`
--

--
-- Dumping data for table `orders`
--

INSERT INTO `orders` (`id`, `date_added`, `user_id`, `status`, `total_price`, `discount`, `subtotal`) VALUES
(94, '2024-08-25 10:58:38', 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 0, 3836.91, 0.00, 3836.91),
(95, '2024-08-25 10:58:52', 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 0, 1767.00, 0.00, 1767.00),
(97, '2024-08-25 11:01:04', 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 0, 2346.49, 469.30, 1877.19),
(98, '2024-08-25 11:46:13', '3jrrdvJWJkhtyEk8qGIJmJJk8M92', 0, 4475.92, 671.39, 3804.53),
(99, '2024-09-03 11:19:48', '3jrrdvJWJkhtyEk8qGIJmJJk8M92', 0, 9206.00, 0.00, 9206.00),
(100, '2024-09-07 12:55:22', '3jrrdvJWJkhtyEk8qGIJmJJk8M92', 0, 8535.00, 0.00, 8535.00),
(101, '2024-09-07 13:21:12', '3jrrdvJWJkhtyEk8qGIJmJJk8M92', 0, 1557.00, 0.00, 1557.00);

-- --------------------------------------------------------

--
-- Table structure for table `order_items`
--
-- Creation: Aug 25, 2024 at 04:08 AM
--

CREATE TABLE `order_items` (
  `id` int(11) NOT NULL,
  `order_id` int(11) NOT NULL,
  `quantity` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `total_price` decimal(11,2) NOT NULL DEFAULT 0.00
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `order_items`:
--   `order_id`
--       `orders` -> `id`
--   `product_id`
--       `products` -> `id`
--

--
-- Dumping data for table `order_items`
--

INSERT INTO `order_items` (`id`, `order_id`, `quantity`, `product_id`, `total_price`) VALUES
(240, 94, 1, 17, 300.00),
(242, 94, 1, 23, 69.00),
(243, 94, 1, 13, 61.00),
(244, 94, 2, 5, 1360.00),
(245, 95, 1, 16, 510.00),
(247, 95, 1, 26, 799.00),
(255, 97, 2, 17, 600.00),
(259, 98, 1, 9, 1099.99),
(260, 98, 1, 25, 599.88),
(261, 98, 1, 20, 799.99),
(262, 98, 1, 13, 60.99),
(263, 98, 1, 23, 69.25),
(264, 99, 1, 7, 4000.11),
(265, 99, 6, 15, 2688.00),
(266, 99, 1, 16, 509.99),
(267, 99, 1, 17, 300.00),
(269, 100, 2, 16, 1019.98),
(270, 100, 2, 25, 1199.76);

-- --------------------------------------------------------

--
-- Table structure for table `products`
--
-- Creation: Aug 29, 2024 at 05:06 AM
--

CREATE TABLE `products` (
  `id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` varchar(255) NOT NULL DEFAULT 'No description available',
  `category_id` int(11) NOT NULL,
  `brand_id` int(11) NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `sale_price` decimal(10,2) DEFAULT NULL,
  `stock` int(11) NOT NULL DEFAULT 0,
  `main_image` varchar(255) DEFAULT NULL,
  `image_gallery` text DEFAULT NULL,
  `specifications` text CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp(),
  `rating` decimal(2,1) NOT NULL DEFAULT 0.0,
  `reviews` int(11) NOT NULL DEFAULT 0
) ;

--
-- RELATIONSHIPS FOR TABLE `products`:
--   `brand_id`
--       `brands` -> `id`
--   `category_id`
--       `categories` -> `id`
--

--
-- Dumping data for table `products`
--

INSERT INTO `products` (`id`, `name`, `description`, `category_id`, `brand_id`, `price`, `sale_price`, `stock`, `main_image`, `image_gallery`, `specifications`, `created_at`, `updated_at`, `rating`, `reviews`) VALUES
(1, 'Samsung QN900B Neo QLED 8K Smart TV', 'High-end QLED 8K Smart TV with stunning picture quality', 1, 1, 2217.85, NULL, 3, 'samsung_qn900b', NULL, NULL, '2024-03-02 17:57:16', '2024-03-02 17:57:16', 4.3, 3),
(2, 'LG G2 OLED evo Gallery Edition TV', 'Gallery Edition TV with OLED 4K display', 1, 2, 3199.99, NULL, 2, 'lg_g2', NULL, NULL, '2024-03-02 17:57:57', '2024-03-02 17:57:57', 0.0, 0),
(3, 'Sony Bravia XR A95K OLED 4K Smart TV', '', 1, 3, 3499.99, 3299.99, 4, 'sony_bravia_a95k', NULL, NULL, '2024-03-02 18:00:17', '2024-03-02 18:00:17', 0.0, 0),
(4, 'Dell XPS 13 OLED 9320', 'Ultra-thin and powerful laptop with Intel Core i7 processor.', 2, 4, 999.00, 599.00, 0, 'dell_xps13', NULL, NULL, '2024-03-02 18:00:55', '2024-03-02 18:00:55', 0.0, 0),
(5, 'HP Spectre x360 14-ef0023dx', 'Convertible laptop with touch screen and sleek des...', 2, 6, 679.99, NULL, 0, 'hp_x360', NULL, NULL, '2024-03-02 18:05:22', '2024-03-02 18:05:22', 0.0, 0),
(6, 'Apple MacBook Air M2', '', 2, 5, 1299.00, 1000.00, 2, 'apple_macbook_air_m2', NULL, NULL, '2024-03-02 18:05:59', '2024-03-02 18:05:59', 0.0, 0),
(7, 'MSI MEG Trident X Gaming Desktop', '', 3, 7, 5699.00, 4000.11, 0, 'msi_trident_x', NULL, NULL, '2024-03-02 18:06:36', '2024-03-02 18:06:36', 0.0, 0),
(8, 'iPhone 14 Pro Max', '', 4, 5, 799.00, NULL, 13, 'iphone_14_pro_max', NULL, NULL, '2024-03-02 18:08:23', '2024-03-02 18:08:23', 0.0, 0),
(9, 'Samsung Galaxy S23 Ultra', '', 4, 1, 1099.99, NULL, 12, 'samsung_galaxy_s23', NULL, NULL, '2024-03-02 18:08:56', '2024-03-02 18:08:56', 0.0, 0),
(10, 'Sony WH-1000XM5 Wireless Noise-Cancelling Headphones', '', 11, 3, 279.49, NULL, 0, 'sony_wh1000xm5', NULL, NULL, '2024-03-02 18:10:24', '2024-03-02 18:10:24', 0.0, 0),
(11, 'Bose QuietComfort 45 Headphones', '', 11, 9, 279.00, NULL, 7, 'bose_qc45', NULL, NULL, '2024-03-02 18:10:58', '2024-03-02 18:10:58', 0.0, 0),
(12, 'Sonos Arc Soundbar', '', 6, 10, 814.50, NULL, 3, 'sonos_arc', NULL, NULL, '2024-03-02 18:11:48', '2024-03-02 18:11:48', 0.0, 0),
(13, 'JBL Flip 5 Portable Bluetooth Speaker', 'Portable waterproof Bluetooth speaker for outdoor use.', 6, 11, 79.93, 60.99, 0, 'jbl_flip5', NULL, NULL, '2024-03-02 18:12:19', '2024-03-02 18:12:19', 0.0, 0),
(15, 'Microsoft Xbox Series X', '', 8, 12, 448.00, NULL, 102, 'microsoft_xbox', NULL, NULL, '2024-03-02 18:15:56', '2024-03-02 18:15:56', 4.3, 4),
(16, 'Nvidia GeForce RTX 3080', 'High-end graphics card for gaming and 3D rendering...', 9, 13, 519.00, 509.99, 3, 'rtx_3080', NULL, NULL, '2024-03-02 18:16:46', '2024-03-02 18:16:46', 0.0, 0),
(17, 'AMD Ryzen 7 Processor', 'High-performance processor for gaming and content creation.', 3, 14, 300.00, NULL, 44, 'amd_ryzen7', NULL, NULL, '2024-05-30 18:41:07', '2024-05-30 18:41:07', 5.0, 1),
(18, 'Apple iPhone 13', 'Latest iPhone model with advanced camera features and iOS 15.', 4, 5, 999.00, 599.99, 100, 'apple_iphone13', NULL, NULL, '2024-05-30 18:41:07', '2024-05-30 18:41:07', 0.0, 0),
(19, 'Bose QuietComfort 35 II', 'Noise-canceling wireless headphones for immersive audio experience.', 11, 9, 249.00, NULL, 30, 'bose_qc35', NULL, NULL, '2024-05-30 18:41:07', '2024-05-30 18:41:07', 0.0, 0),
(20, 'Dell XPS 13 Laptop', 'Ultra-thin and powerful laptop with Intel Core i7 processor.', 2, 4, 1299.00, 799.99, 8, 'dell_xps13', NULL, NULL, '2024-05-30 18:41:07', '2024-05-30 18:41:07', 0.0, 0),
(21, 'Google Nest Hub', 'Smart display with Google Assistant for home automation and entertainment.', 5, 8, 149.00, NULL, 5, 'google_nest', NULL, NULL, '2024-05-30 18:41:07', '2024-05-30 18:41:07', 4.5, 2),
(22, 'HP Spectre x360', 'Convertible laptop with touch screen and sleek design.', 2, 6, 1199.00, NULL, 25, 'hp_x360', NULL, NULL, '2024-05-30 18:41:07', '2024-05-30 18:41:07', 0.0, 0),
(23, 'JBL Flip 5', 'Portable waterproof Bluetooth speaker for outdoor use.', 6, 11, 99.00, 69.25, 38, 'jbl_flip5', NULL, NULL, '2024-05-30 18:41:07', '2024-05-30 18:41:07', 0.0, 0),
(25, 'Microsoft Surface Pro 7', 'Versatile 2-in-1 tablet/laptop with Windows 10 and Surface Pen support.', 2, 12, 899.00, 599.88, 32, 'microsoft_surface', NULL, NULL, '2024-05-30 18:41:07', '2024-05-30 18:41:07', 0.0, 0),
(26, 'MSI GeForce RTX 3080', 'High-end graphics card for gaming and 3D rendering.', 9, 7, 799.00, NULL, 3, 'rtx_3080', NULL, NULL, '2024-05-30 18:41:07', '2024-05-30 18:41:07', 0.0, 0),
(27, 'XYZ Smartwatch', 'Stylish smartwatch with health tracking features.', 10, 5, 149.99, NULL, 30, 'xyz_smartwatch', NULL, NULL, '2024-05-30 18:44:42', '2024-05-30 18:44:42', 0.0, 0),
(28, 'SoundWave Pro', 'True wireless earbuds with noise cancellation.', 6, 9, 79.99, NULL, 50, 'soundwave_pro', NULL, NULL, '2024-05-30 18:44:42', '2024-05-30 18:44:42', 0.0, 0),
(29, 'PowerUp 10000', 'Compact power bank for on-the-go charging.', 10, 1, 29.99, NULL, 100, 'powerup_10000', NULL, NULL, '2024-05-30 18:44:42', '2024-05-30 18:44:42', 0.0, 0),
(30, 'BassBoom 500', 'Waterproof portable speaker with deep bass.', 6, 9, 89.99, NULL, 20, 'bassboom_500', NULL, NULL, '2024-05-30 18:44:42', '2024-05-30 18:44:42', 0.0, 0),
(38, 'PC i5-12400F', 'Lorem ipsum odor amet, consectetuer adipiscing elit. Consequat dapibus velit ultrices lacinia blandit risus aptent. Senectus mus nam nec vehicula Bibendum fusce.', 12, 15, 250.00, NULL, 10, 'pc_i5_12400f', NULL, 'Lorem ipsum odor amet, consectetuer adipiscing elit. Consequat dapibus velit ultrices lacinia blandit risus aptent. Senectus mus nam nec vehicula Bibendum fusce.', '2024-08-29 12:22:18', '2024-08-29 12:22:18', 0.0, 0),
(39, 'PC i5-12400F', 'Lorem ipsum odor amet, consectetuer adipiscing elit. Consequat dapibus velit ultrices lacinia blandit risus aptent. Senectus mus nam nec vehicula Bibendum fusce.', 12, 15, 250.00, NULL, 10, 'pc_i5_12400f', NULL, 'Lorem ipsum odor amet, consectetuer adipiscing elit. Consequat dapibus velit ultrices lacinia blandit risus aptent. Senectus mus nam nec vehicula Bibendum fusce.', '2024-08-29 12:23:05', '2024-08-29 12:23:05', 0.0, 0);

-- --------------------------------------------------------

--
-- Table structure for table `reviews`
--
-- Creation: Aug 05, 2024 at 02:38 AM
--

CREATE TABLE `reviews` (
  `review_id` int(11) NOT NULL,
  `user_id` varchar(255) NOT NULL,
  `product_id` int(11) NOT NULL,
  `rating` int(11) NOT NULL CHECK (`rating` >= 1 and `rating` <= 5),
  `review_text` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `reviews`:
--   `user_id`
--       `users` -> `id`
--   `product_id`
--       `products` -> `id`
--

--
-- Dumping data for table `reviews`
--

INSERT INTO `reviews` (`review_id`, `user_id`, `product_id`, `rating`, `review_text`, `created_at`) VALUES
(1, '99rQgkUMyddb77MVZ0nEcn0BQwH2', 15, 4, NULL, '2024-08-10 03:30:04'),
(2, '99rQgkUMyddb77MVZ0nEcn0BQwH2', 15, 5, 'This is good product', '2024-08-10 03:31:46'),
(3, '99rQgkUMyddb77MVZ0nEcn0BQwH2', 1, 4, 'Good reviews about this product', '2024-08-10 04:10:58'),
(4, '99rQgkUMyddb77MVZ0nEcn0BQwH2', 1, 5, 'Good reviews about this product', '2024-08-10 04:11:03'),
(5, '99rQgkUMyddb77MVZ0nEcn0BQwH2', 15, 5, 'This is a good product that I can do anything to buy it... !!!', '2024-08-10 04:12:08'),
(6, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 17, 5, 'I think this is good product', '2024-08-11 02:41:34'),
(7, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 1, 4, 'Good', '2024-08-11 02:43:32'),
(8, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', 21, 5, 'This is really good product for me', '2024-09-04 04:12:55'),
(9, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', 21, 4, 'Good', '2024-09-08 02:42:58'),
(10, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', 15, 3, 'This is bad product', '2024-09-08 02:43:35');

-- --------------------------------------------------------

--
-- Table structure for table `users`
--
-- Creation: Mar 02, 2024 at 02:39 AM
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
-- RELATIONSHIPS FOR TABLE `users`:
--

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `email`, `password`, `username`, `first_name`, `last_name`, `role`, `token`, `created_at`, `last_login`) VALUES
('3jrrdvJWJkhtyEk8qGIJmJJk8M92', 'test3@gmail.com', '$2b$10$4qaTwuUrYvjY3N1g1Gp1AeOkPitaZcif7s.nqSaUnGGmgEBqsdDsa', 'customer2', NULL, NULL, 'Customer', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjNqcnJkdkpXSmtodHlFazhxR0lKbUpKazhNOTIiLCJlbWFpbCI6InRlc3QzQGdtYWlsLmNvbSIsImlhdCI6MTcyNDQwNzIzNywiZXhwIjoxNzI2OTk5MjM3fQ.AqGL7eU1FenPpVLIE-TXGbJBaqQZXXwnM88OaXWjs0E', '2024-05-30 22:04:31', '2024-09-08 09:42:39'),
('99rQgkUMyddb77MVZ0nEcn0BQwH2', 'test5@gmail.com', '$2b$10$l4hjob0EsSiGlm0a/Xy6ae2OjD8vEGvOlm97RcMVoB6F1LG8sTROy', 'customer2002', NULL, NULL, 'Customer', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6Ijk5clFna1VNeWRkYjc3TVZaMG5FY24wQlF3SDIiLCJlbWFpbCI6InRlc3Q1QGdtYWlsLmNvbSIsImlhdCI6MTcyMzA5MjM2MiwiZXhwIjoxNzI1Njg0MzYyfQ.24oqNrB42UyLng7YRPRCulKyARYEvD__m4L7bWfcxSc', '2024-08-08 11:46:02', '2024-08-08 11:46:02'),
('ljul8hizGLbsDwKUIjHIJYXCnFF3', 'test1@gmail.com', '$2b$10$hI67QaYzryi9sCUz7y34Suip3fMIx2rrFvQnraE6BKRR9MFc/tHsG', 'customer1', NULL, NULL, 'Customer', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImxqdWw4aGl6R0xic0R3S1VJakhJSllYQ25GRjMiLCJlbWFpbCI6InRlc3QxQGdtYWlsLmNvbSIsImlhdCI6MTcyNTY4ODg5MCwiZXhwIjoxNzI4MjgwODkwfQ.2onfKXTk3Q1YKhz6CNLOSl4CK5peNdn9hGL35grkO8w', '2024-03-02 10:26:21', '2024-09-07 13:01:30'),
('S4eQ5Rh524MyjdHQ2EKBZHpjoCv1', 'test2@gmail.com', '$2b$10$dVYe4JIupYWsluoE1/vES.oUeFSjTaokJ7x47Exg5ne/UzCkpzR8O', 'admin123', NULL, NULL, 'Admin', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IlM0ZVE1Umg1MjRNeWpkSFEyRUtCWkhwam9DdjEiLCJlbWFpbCI6InRlc3QyQGdtYWlsLmNvbSIsImlhdCI6MTcyNDkwMDY4NiwiZXhwIjoxNzI3NDkyNjg2fQ.qUp3cQjs7InY7sC3slrZv6_9ZbzOOD88zqR6Sq8FPbA', '2024-05-30 10:49:33', '2024-09-05 19:35:25'),
('yGbezIdeDnPB6kSlVxFKQsO4tvD3', 'test4@gmail.com', '$2b$10$QS.HJbO/ZFmjEFfvO1D1PusEMQBwFQfDcof7xvf/ZyU5dhpdmV52C', 'customer3', NULL, NULL, 'Customer', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InlHYmV6SWRlRG5QQjZrU2xWeEZLUXNPNHR2RDMiLCJlbWFpbCI6InRlc3Q0QGdtYWlsLmNvbSIsImlhdCI6MTcxNzA4MTU3MiwiZXhwIjoxNzE5NjczNTcyfQ.V3qT_-H6Al5j95qiaB-0dHgC49jn5uU1KS_PVC9LdkY', '2024-05-30 22:06:12', '2024-06-05 09:28:03');

-- --------------------------------------------------------

--
-- Table structure for table `wishlist`
--
-- Creation: Mar 09, 2024 at 04:01 AM
--

CREATE TABLE `wishlist` (
  `id` int(11) NOT NULL,
  `user_id` varchar(255) NOT NULL,
  `product_id` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `wishlist`:
--   `product_id`
--       `products` -> `id`
--   `user_id`
--       `users` -> `id`
--

--
-- Dumping data for table `wishlist`
--

INSERT INTO `wishlist` (`id`, `user_id`, `product_id`) VALUES
(143, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', 7),
(161, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', 12),
(153, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', 16),
(160, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', 17),
(158, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', 21),
(159, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', 25),
(133, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 5),
(136, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 12),
(135, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 13),
(134, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 20);

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
-- Indexes for table `customer_sessions`
--
ALTER TABLE `customer_sessions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `discount`
--
ALTER TABLE `discount`
  ADD PRIMARY KEY (`discount_id`),
  ADD UNIQUE KEY `discount_code` (`discount_code`);

--
-- Indexes for table `orders`
--
ALTER TABLE `orders`
  ADD PRIMARY KEY (`id`),
  ADD KEY `FK_UserOrder` (`user_id`);

--
-- Indexes for table `order_items`
--
ALTER TABLE `order_items`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `order_id` (`order_id`,`product_id`),
  ADD KEY `FK_ProductOrderItem` (`product_id`);

--
-- Indexes for table `products`
--
ALTER TABLE `products`
  ADD PRIMARY KEY (`id`),
  ADD KEY `FK_ProductCategory` (`category_id`),
  ADD KEY `FK_ProductBrand` (`brand_id`);

--
-- Indexes for table `reviews`
--
ALTER TABLE `reviews`
  ADD PRIMARY KEY (`review_id`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `product_id` (`product_id`);

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
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=16;

--
-- AUTO_INCREMENT for table `cart`
--
ALTER TABLE `cart`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=105;

--
-- AUTO_INCREMENT for table `cart_items`
--
ALTER TABLE `cart_items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=405;

--
-- AUTO_INCREMENT for table `categories`
--
ALTER TABLE `categories`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=19;

--
-- AUTO_INCREMENT for table `customer_sessions`
--
ALTER TABLE `customer_sessions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=138;

--
-- AUTO_INCREMENT for table `discount`
--
ALTER TABLE `discount`
  MODIFY `discount_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `orders`
--
ALTER TABLE `orders`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=102;

--
-- AUTO_INCREMENT for table `order_items`
--
ALTER TABLE `order_items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=272;

--
-- AUTO_INCREMENT for table `products`
--
ALTER TABLE `products`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reviews`
--
ALTER TABLE `reviews`
  MODIFY `review_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

--
-- AUTO_INCREMENT for table `wishlist`
--
ALTER TABLE `wishlist`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=162;

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
  ADD CONSTRAINT `FK_CartItemCart` FOREIGN KEY (`cart_id`) REFERENCES `cart` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `FK_CartItemProduct` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`);

--
-- Constraints for table `customer_sessions`
--
ALTER TABLE `customer_sessions`
  ADD CONSTRAINT `customer_sessions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);

--
-- Constraints for table `orders`
--
ALTER TABLE `orders`
  ADD CONSTRAINT `FK_UserOrder` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `order_items`
--
ALTER TABLE `order_items`
  ADD CONSTRAINT `FK_OrderOrderItem` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `FK_ProductOrderItem` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`);

--
-- Constraints for table `products`
--
ALTER TABLE `products`
  ADD CONSTRAINT `FK_ProductBrand` FOREIGN KEY (`brand_id`) REFERENCES `brands` (`id`),
  ADD CONSTRAINT `FK_ProductCategory` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`);

--
-- Constraints for table `reviews`
--
ALTER TABLE `reviews`
  ADD CONSTRAINT `reviews_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `reviews_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`);

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
