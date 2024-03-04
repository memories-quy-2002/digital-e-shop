-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Mar 04, 2024 at 01:29 AM
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
) ;

--
-- Dumping data for table `products`
--

INSERT INTO `products` (`id`, `name`, `description`, `category_id`, `brand_id`, `price`, `sale_price`, `stock`, `main_image`, `image_gallery`, `specifications`, `created_at`, `updated_at`, `rating`, `reviews`) VALUES
(1, 'Samsung QN900B Neo QLED 8K Smart TV', '', 1, 1, 2217.85, NULL, 3, '', NULL, NULL, '2024-03-02 17:57:16', '2024-03-02 17:57:16', 0.0, 0),
(2, 'LG G2 OLED evo Gallery Edition TV', '', 1, 2, 3199.99, NULL, 2, '', NULL, NULL, '2024-03-02 17:57:57', '2024-03-02 17:57:57', 0.0, 0),
(3, 'Sony Bravia XR A95K OLED 4K Smart TV', '', 1, 3, 3499.99, NULL, 4, '', NULL, NULL, '2024-03-02 18:00:17', '2024-03-02 18:00:17', 0.0, 0),
(4, 'Dell XPS 13 OLED 9320', '', 2, 4, 999.00, NULL, 2, '', NULL, NULL, '2024-03-02 18:00:55', '2024-03-02 18:00:55', 0.0, 0),
(5, 'HP Spectre x360 14-ef0023dx', '', 2, 6, 679.99, NULL, 2, '', NULL, NULL, '2024-03-02 18:05:22', '2024-03-02 18:05:22', 0.0, 0),
(6, 'Apple MacBook Air M2', '', 2, 5, 1299.00, NULL, 2, '', NULL, NULL, '2024-03-02 18:05:59', '2024-03-02 18:05:59', 0.0, 0),
(7, 'MSI MEG Trident X Gaming Desktop', '', 3, 7, 5699.00, NULL, 0, '', NULL, NULL, '2024-03-02 18:06:36', '2024-03-02 18:06:36', 0.0, 0),
(8, 'iPhone 14 Pro Max', '', 4, 5, 799.00, NULL, 13, '', NULL, NULL, '2024-03-02 18:08:23', '2024-03-02 18:08:23', 0.0, 0),
(9, 'Samsung Galaxy S23 Ultra', '', 4, 1, 1099.99, NULL, 13, '', NULL, NULL, '2024-03-02 18:08:56', '2024-03-02 18:08:56', 0.0, 0),
(10, 'Sony WH-1000XM5 Wireless Noise-Cancelling Headphones', '', 11, 3, 279.49, NULL, 7, '', NULL, NULL, '2024-03-02 18:10:24', '2024-03-02 18:10:24', 0.0, 0),
(11, 'Bose QuietComfort 45 Headphones', '', 11, 9, 279.00, NULL, 7, '', NULL, NULL, '2024-03-02 18:10:58', '2024-03-02 18:10:58', 0.0, 0),
(12, 'Sonos Arc Soundbar', '', 6, 10, 814.50, NULL, 3, '', NULL, NULL, '2024-03-02 18:11:48', '2024-03-02 18:11:48', 0.0, 0),
(13, 'JBL Flip 5 Portable Bluetooth Speaker', '', 6, 11, 79.93, NULL, 1, '', NULL, NULL, '2024-03-02 18:12:19', '2024-03-02 18:12:19', 0.0, 0),
(15, 'Microsoft Xbox Series X', '', 8, 12, 448.00, NULL, 1, '', NULL, NULL, '2024-03-02 18:15:56', '2024-03-02 18:15:56', 0.0, 0),
(16, 'Nvidia GeForce RTX 3080', '', 9, 13, 519.00, NULL, 10, '', NULL, NULL, '2024-03-02 18:16:46', '2024-03-02 18:16:46', 0.0, 0);

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
('ljul8hizGLbsDwKUIjHIJYXCnFF3', 'test1@gmail.com', '$2b$10$hI67QaYzryi9sCUz7y34Suip3fMIx2rrFvQnraE6BKRR9MFc/tHsG', 'memories2002', NULL, NULL, 'Customer', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImxqdWw4aGl6R0xic0R3S1VJakhJSllYQ25GRjMiLCJlbWFpbCI6InRlc3QxQGdtYWlsLmNvbSIsImlhdCI6MTcwOTM0OTk4MSwiZXhwIjoxNzExOTQxOTgxfQ.7za82_X9r0uBYLPnzPTCa5QqThLsxnFlmjX2de3EoZI', '2024-03-02 10:26:21', '2024-03-02 10:36:20');

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
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `brands`
--
ALTER TABLE `brands`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=15;

--
-- AUTO_INCREMENT for table `categories`
--
ALTER TABLE `categories`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=12;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `products`
--
ALTER TABLE `products`
  ADD CONSTRAINT `FK_ProductBrand` FOREIGN KEY (`brand_id`) REFERENCES `brands` (`id`),
  ADD CONSTRAINT `FK_ProductCategory` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
