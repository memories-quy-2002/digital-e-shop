-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Jun 05, 2024 at 07:45 AM
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
-- Creation: Mar 02, 2024 at 09:58 AM
--

CREATE TABLE `brands` (
  `id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL
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
-- Last update: Jun 05, 2024 at 05:06 AM
--

CREATE TABLE `cart` (
  `id` int(11) NOT NULL,
  `user_id` varchar(255) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `done` tinyint(1) NOT NULL DEFAULT 0
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
(8, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-05-28 12:04:33', 1),
(14, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-05-28 12:27:00', 1),
(18, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-05-29 11:06:42', 1),
(19, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-05-30 22:04:36', 1),
(20, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-05-30 22:05:03', 1),
(21, 'yGbezIdeDnPB6kSlVxFKQsO4tvD3', '2024-05-30 22:06:18', 1),
(22, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-06-03 09:11:56', 1),
(23, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-06-04 17:57:54', 1),
(24, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-06-04 17:59:05', 1),
(25, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-06-04 18:01:11', 1),
(26, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-06-04 18:01:28', 1),
(27, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-06-04 18:01:38', 1),
(28, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-06-04 18:01:48', 1),
(29, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-06-04 18:01:58', 1),
(30, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-06-04 18:02:26', 1),
(31, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-06-04 18:02:43', 1),
(32, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-06-04 18:02:51', 1),
(33, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-06-04 18:03:10', 1),
(34, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-06-04 18:03:38', 1),
(35, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-06-04 18:03:45', 1),
(36, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-06-04 18:03:55', 1),
(37, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-06-04 18:04:26', 1),
(38, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-06-04 18:04:38', 1),
(39, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-06-04 18:06:13', 1),
(40, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', '2024-06-04 18:08:32', 1),
(41, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-06-04 18:09:25', 1),
(42, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-06-04 18:09:34', 1),
(43, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-06-04 18:09:53', 1),
(44, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-06-04 18:10:06', 1),
(45, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-06-04 18:10:12', 1),
(46, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-06-04 18:10:21', 1),
(47, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-06-04 18:10:37', 1),
(48, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-06-04 18:12:30', 1),
(49, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-06-04 18:12:39', 1),
(50, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-06-04 18:12:47', 1),
(51, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-06-04 18:12:57', 1),
(52, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-06-04 18:13:03', 1),
(53, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-06-04 18:13:12', 1),
(54, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-06-04 18:13:17', 1),
(55, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-06-04 18:13:24', 1),
(56, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-06-04 18:13:34', 1),
(57, 'yGbezIdeDnPB6kSlVxFKQsO4tvD3', '2024-06-04 18:16:55', 1),
(58, 'yGbezIdeDnPB6kSlVxFKQsO4tvD3', '2024-06-04 18:17:04', 1),
(59, 'yGbezIdeDnPB6kSlVxFKQsO4tvD3', '2024-06-04 18:17:16', 1),
(60, 'yGbezIdeDnPB6kSlVxFKQsO4tvD3', '2024-06-04 18:17:26', 1),
(61, 'yGbezIdeDnPB6kSlVxFKQsO4tvD3', '2024-06-04 18:17:36', 1),
(62, 'yGbezIdeDnPB6kSlVxFKQsO4tvD3', '2024-06-04 18:17:45', 1),
(63, 'yGbezIdeDnPB6kSlVxFKQsO4tvD3', '2024-06-04 18:19:07', 1),
(64, 'yGbezIdeDnPB6kSlVxFKQsO4tvD3', '2024-06-04 18:19:18', 1),
(65, 'yGbezIdeDnPB6kSlVxFKQsO4tvD3', '2024-06-04 18:19:28', 1),
(66, 'yGbezIdeDnPB6kSlVxFKQsO4tvD3', '2024-06-04 18:19:39', 1),
(67, 'yGbezIdeDnPB6kSlVxFKQsO4tvD3', '2024-06-04 18:19:48', 1),
(68, 'yGbezIdeDnPB6kSlVxFKQsO4tvD3', '2024-06-04 18:19:54', 1),
(69, 'yGbezIdeDnPB6kSlVxFKQsO4tvD3', '2024-06-04 18:23:22', 1),
(70, 'yGbezIdeDnPB6kSlVxFKQsO4tvD3', '2024-06-04 18:23:30', 1),
(71, 'yGbezIdeDnPB6kSlVxFKQsO4tvD3', '2024-06-04 18:24:38', 1),
(72, 'yGbezIdeDnPB6kSlVxFKQsO4tvD3', '2024-06-04 18:24:54', 1),
(73, 'yGbezIdeDnPB6kSlVxFKQsO4tvD3', '2024-06-04 18:25:22', 1),
(74, 'yGbezIdeDnPB6kSlVxFKQsO4tvD3', '2024-06-04 18:25:30', 1),
(75, 'yGbezIdeDnPB6kSlVxFKQsO4tvD3', '2024-06-04 18:27:38', 1),
(76, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-06-05 09:31:14', 1),
(77, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-06-05 11:43:36', 1),
(78, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', '2024-06-05 12:04:23', 1);

-- --------------------------------------------------------

--
-- Table structure for table `cart_items`
--
-- Creation: May 28, 2024 at 05:32 AM
-- Last update: Jun 05, 2024 at 05:04 AM
--

CREATE TABLE `cart_items` (
  `id` int(11) NOT NULL,
  `cart_id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `quantity` int(11) NOT NULL,
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
(24, 8, 15, 1, '2024-05-28 12:04:33'),
(25, 8, 7, 1, '2024-05-28 12:04:33'),
(26, 8, 16, 1, '2024-05-28 12:04:35'),
(38, 14, 15, 1, '2024-05-28 12:27:00'),
(39, 14, 7, 1, '2024-05-28 12:27:01'),
(47, 18, 16, 1, '2024-05-29 11:06:42'),
(48, 18, 11, 1, '2024-05-29 11:06:48'),
(49, 18, 10, 2, '2024-05-29 11:06:52'),
(51, 19, 21, 1, '2024-05-30 22:04:36'),
(52, 19, 7, 1, '2024-05-30 22:04:37'),
(53, 19, 11, 1, '2024-05-30 22:04:39'),
(54, 19, 6, 2, '2024-05-30 22:04:40'),
(55, 19, 5, 1, '2024-05-30 22:04:41'),
(57, 20, 7, 1, '2024-05-30 22:05:03'),
(58, 20, 17, 1, '2024-05-30 22:05:04'),
(59, 20, 16, 1, '2024-05-30 22:05:06'),
(60, 21, 22, 1, '2024-05-30 22:06:18'),
(61, 21, 29, 2, '2024-05-30 22:06:19'),
(62, 21, 9, 1, '2024-05-30 22:06:20'),
(63, 21, 12, 1, '2024-05-30 22:06:21'),
(65, 22, 21, 7, '2024-06-03 09:11:56'),
(67, 22, 15, 2, '2024-06-03 09:12:54'),
(69, 22, 7, 2, '2024-06-03 09:12:57'),
(72, 22, 17, 2, '2024-06-04 17:55:59'),
(74, 22, 16, 2, '2024-06-04 17:56:01'),
(76, 22, 11, 2, '2024-06-04 17:56:04'),
(77, 22, 10, 1, '2024-06-04 17:56:06'),
(79, 22, 18, 1, '2024-06-04 17:56:08'),
(81, 23, 21, 1, '2024-06-04 17:57:54'),
(82, 23, 17, 1, '2024-06-04 17:57:55'),
(83, 23, 26, 1, '2024-06-04 17:57:56'),
(84, 23, 5, 6, '2024-06-04 17:57:58'),
(85, 23, 25, 1, '2024-06-04 17:57:59'),
(86, 23, 27, 1, '2024-06-04 17:58:00'),
(87, 23, 9, 1, '2024-06-04 17:58:01'),
(88, 23, 12, 1, '2024-06-04 17:58:02'),
(89, 23, 30, 1, '2024-06-04 17:58:04'),
(90, 23, 1, 1, '2024-06-04 17:58:05'),
(91, 23, 3, 1, '2024-06-04 17:58:05'),
(92, 23, 23, 1, '2024-06-04 17:58:06'),
(93, 23, 13, 2, '2024-06-04 17:58:07'),
(95, 23, 22, 5, '2024-06-04 17:58:22'),
(97, 24, 21, 1, '2024-06-04 17:59:05'),
(98, 24, 7, 1, '2024-06-04 17:59:06'),
(99, 24, 16, 1, '2024-06-04 17:59:07'),
(100, 24, 18, 1, '2024-06-04 17:59:08'),
(101, 24, 5, 1, '2024-06-04 17:59:09'),
(102, 24, 6, 1, '2024-06-04 17:59:09'),
(103, 24, 4, 1, '2024-06-04 17:59:10'),
(104, 25, 21, 1, '2024-06-04 18:01:11'),
(105, 25, 15, 1, '2024-06-04 18:01:12'),
(106, 26, 16, 1, '2024-06-04 18:01:28'),
(107, 26, 18, 1, '2024-06-04 18:01:29'),
(108, 26, 11, 1, '2024-06-04 18:01:30'),
(109, 27, 10, 1, '2024-06-04 18:01:38'),
(110, 27, 4, 1, '2024-06-04 18:01:39'),
(111, 27, 5, 1, '2024-06-04 18:01:39'),
(112, 28, 30, 1, '2024-06-04 18:01:48'),
(113, 28, 12, 1, '2024-06-04 18:01:49'),
(114, 28, 13, 1, '2024-06-04 18:01:49'),
(115, 29, 15, 1, '2024-06-04 18:01:58'),
(116, 29, 7, 1, '2024-06-04 18:01:59'),
(117, 29, 17, 1, '2024-06-04 18:02:00'),
(118, 29, 16, 1, '2024-06-04 18:02:00'),
(119, 29, 29, 1, '2024-06-04 18:02:03'),
(120, 30, 7, 1, '2024-06-04 18:02:26'),
(121, 30, 18, 1, '2024-06-04 18:02:27'),
(122, 30, 10, 1, '2024-06-04 18:02:28'),
(123, 30, 4, 1, '2024-06-04 18:02:29'),
(124, 30, 29, 1, '2024-06-04 18:02:33'),
(125, 31, 21, 1, '2024-06-04 18:02:43'),
(126, 32, 22, 1, '2024-06-04 18:02:51'),
(127, 32, 9, 1, '2024-06-04 18:02:53'),
(128, 32, 12, 1, '2024-06-04 18:02:56'),
(129, 33, 7, 1, '2024-06-04 18:03:10'),
(130, 33, 17, 1, '2024-06-04 18:03:11'),
(131, 33, 16, 1, '2024-06-04 18:03:12'),
(132, 33, 18, 1, '2024-06-04 18:03:12'),
(133, 33, 26, 1, '2024-06-04 18:03:13'),
(134, 34, 15, 1, '2024-06-04 18:03:38'),
(135, 35, 27, 2, '2024-06-04 18:03:45'),
(137, 35, 29, 4, '2024-06-04 18:03:46'),
(141, 36, 8, 1, '2024-06-04 18:03:55'),
(142, 36, 12, 1, '2024-06-04 18:03:56'),
(143, 36, 13, 1, '2024-06-04 18:03:57'),
(144, 36, 23, 2, '2024-06-04 18:03:57'),
(146, 37, 15, 1, '2024-06-04 18:04:26'),
(147, 37, 7, 1, '2024-06-04 18:04:28'),
(148, 38, 30, 1, '2024-06-04 18:04:38'),
(149, 39, 21, 1, '2024-06-04 18:08:07'),
(150, 39, 15, 1, '2024-06-04 18:08:08'),
(151, 39, 7, 1, '2024-06-04 18:08:08'),
(152, 40, 21, 1, '2024-06-04 18:08:32'),
(153, 41, 15, 1, '2024-06-04 18:09:25'),
(154, 41, 17, 1, '2024-06-04 18:09:26'),
(155, 41, 7, 1, '2024-06-04 18:09:26'),
(156, 41, 18, 1, '2024-06-04 18:09:27'),
(157, 41, 26, 1, '2024-06-04 18:09:27'),
(158, 42, 21, 1, '2024-06-04 18:09:34'),
(159, 42, 17, 1, '2024-06-04 18:09:35'),
(160, 42, 27, 1, '2024-06-04 18:09:37'),
(161, 42, 20, 1, '2024-06-04 18:09:37'),
(162, 43, 21, 1, '2024-06-04 18:09:53'),
(163, 43, 7, 1, '2024-06-04 18:09:53'),
(164, 43, 16, 1, '2024-06-04 18:09:54'),
(165, 43, 18, 1, '2024-06-04 18:09:55'),
(166, 44, 25, 1, '2024-06-04 18:10:06'),
(167, 44, 6, 1, '2024-06-04 18:10:06'),
(168, 45, 21, 1, '2024-06-04 18:10:12'),
(169, 45, 17, 1, '2024-06-04 18:10:13'),
(170, 45, 3, 1, '2024-06-04 18:10:15'),
(171, 46, 21, 1, '2024-06-04 18:10:21'),
(172, 46, 15, 1, '2024-06-04 18:10:22'),
(173, 46, 7, 1, '2024-06-04 18:10:22'),
(174, 46, 16, 1, '2024-06-04 18:10:23'),
(175, 46, 18, 1, '2024-06-04 18:10:23'),
(177, 47, 21, 1, '2024-06-04 18:10:37'),
(178, 47, 16, 1, '2024-06-04 18:10:38'),
(179, 47, 23, 1, '2024-06-04 18:10:40'),
(180, 47, 13, 1, '2024-06-04 18:10:40'),
(181, 47, 28, 1, '2024-06-04 18:10:41'),
(182, 47, 30, 1, '2024-06-04 18:10:44'),
(183, 47, 1, 1, '2024-06-04 18:10:44'),
(184, 48, 18, 1, '2024-06-04 18:12:30'),
(185, 48, 26, 1, '2024-06-04 18:12:31'),
(186, 48, 16, 1, '2024-06-04 18:12:31'),
(187, 49, 21, 1, '2024-06-04 18:12:39'),
(188, 49, 15, 1, '2024-06-04 18:12:41'),
(189, 50, 16, 1, '2024-06-04 18:12:47'),
(190, 50, 18, 1, '2024-06-04 18:12:48'),
(191, 50, 11, 1, '2024-06-04 18:12:50'),
(192, 51, 15, 1, '2024-06-04 18:12:57'),
(193, 52, 16, 1, '2024-06-04 18:13:03'),
(194, 52, 11, 1, '2024-06-04 18:13:04'),
(195, 53, 21, 1, '2024-06-04 18:13:12'),
(196, 54, 16, 3, '2024-06-04 18:13:17'),
(199, 54, 17, 3, '2024-06-04 18:13:18'),
(202, 55, 7, 1, '2024-06-04 18:13:24'),
(203, 55, 15, 1, '2024-06-04 18:13:24'),
(204, 55, 21, 1, '2024-06-04 18:13:25'),
(205, 56, 20, 1, '2024-06-04 18:13:34'),
(206, 56, 25, 1, '2024-06-04 18:13:35'),
(207, 56, 27, 1, '2024-06-04 18:13:35'),
(208, 57, 21, 1, '2024-06-04 18:16:55'),
(209, 57, 15, 1, '2024-06-04 18:16:56'),
(210, 57, 17, 1, '2024-06-04 18:16:57'),
(211, 57, 7, 1, '2024-06-04 18:16:57'),
(212, 58, 17, 1, '2024-06-04 18:17:04'),
(213, 58, 16, 1, '2024-06-04 18:17:05'),
(214, 58, 4, 1, '2024-06-04 18:17:06'),
(215, 58, 19, 6, '2024-06-04 18:17:07'),
(221, 58, 11, 2, '2024-06-04 18:17:08'),
(223, 59, 27, 1, '2024-06-04 18:17:16'),
(224, 59, 25, 1, '2024-06-04 18:17:16'),
(225, 59, 29, 1, '2024-06-04 18:17:17'),
(226, 59, 22, 1, '2024-06-04 18:17:18'),
(227, 59, 20, 4, '2024-06-04 18:17:18'),
(231, 60, 15, 2, '2024-06-04 18:17:26'),
(233, 60, 21, 2, '2024-06-04 18:17:27'),
(235, 60, 23, 2, '2024-06-04 18:17:30'),
(237, 60, 13, 2, '2024-06-04 18:17:31'),
(239, 61, 15, 1, '2024-06-04 18:17:36'),
(240, 62, 19, 1, '2024-06-04 18:17:45'),
(241, 62, 4, 1, '2024-06-04 18:17:46'),
(242, 62, 10, 2, '2024-06-04 18:17:46'),
(244, 62, 11, 1, '2024-06-04 18:18:45'),
(245, 62, 5, 1, '2024-06-04 18:18:47'),
(246, 63, 10, 2, '2024-06-04 18:19:07'),
(247, 63, 11, 2, '2024-06-04 18:19:08'),
(249, 63, 19, 2, '2024-06-04 18:19:09'),
(252, 64, 29, 1, '2024-06-04 18:19:18'),
(253, 64, 27, 1, '2024-06-04 18:19:19'),
(254, 65, 13, 2, '2024-06-04 18:19:28'),
(256, 65, 12, 2, '2024-06-04 18:19:29'),
(258, 65, 28, 2, '2024-06-04 18:19:30'),
(260, 66, 21, 1, '2024-06-04 18:19:39'),
(261, 66, 15, 1, '2024-06-04 18:19:39'),
(262, 66, 16, 2, '2024-06-04 18:19:41'),
(264, 67, 7, 1, '2024-06-04 18:19:48'),
(265, 68, 18, 2, '2024-06-04 18:19:54'),
(267, 69, 21, 1, '2024-06-04 18:23:22'),
(268, 69, 15, 1, '2024-06-04 18:23:23'),
(269, 70, 15, 1, '2024-06-04 18:23:30'),
(270, 70, 7, 1, '2024-06-04 18:23:30'),
(271, 70, 18, 1, '2024-06-04 18:23:31'),
(272, 71, 21, 1, '2024-06-04 18:23:38'),
(273, 72, 18, 2, '2024-06-04 18:19:54'),
(274, 73, 21, 1, '2024-06-04 18:23:22'),
(275, 73, 15, 1, '2024-06-04 18:23:23'),
(276, 74, 15, 1, '2024-06-04 18:23:30'),
(277, 74, 7, 1, '2024-06-04 18:23:30'),
(278, 74, 18, 1, '2024-06-04 18:23:31'),
(279, 75, 21, 1, '2024-06-04 18:23:38'),
(280, 76, 21, 1, '2024-06-05 09:31:14'),
(281, 76, 15, 1, '2024-06-05 09:31:14'),
(282, 76, 26, 1, '2024-06-05 09:34:29'),
(283, 76, 13, 1, '2024-06-05 09:34:30'),
(284, 76, 20, 1, '2024-06-05 09:34:31'),
(285, 77, 21, 1, '2024-06-05 11:43:36'),
(286, 77, 15, 1, '2024-06-05 11:43:42'),
(287, 77, 30, 1, '2024-06-05 11:44:37'),
(288, 77, 1, 1, '2024-06-05 11:44:38'),
(289, 78, 15, 1, '2024-06-05 12:04:23');

-- --------------------------------------------------------

--
-- Table structure for table `categories`
--
-- Creation: Mar 02, 2024 at 09:58 AM
--

CREATE TABLE `categories` (
  `id` int(11) NOT NULL,
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
(4, 'Smartphone'),
(6, 'Speaker'),
(1, 'Television');

-- --------------------------------------------------------

--
-- Table structure for table `orders`
--
-- Creation: May 29, 2024 at 04:11 AM
-- Last update: Jun 05, 2024 at 05:06 AM
--

CREATE TABLE `orders` (
  `id` int(11) NOT NULL,
  `date_added` datetime NOT NULL DEFAULT current_timestamp(),
  `user_id` varchar(255) NOT NULL,
  `status` int(1) NOT NULL DEFAULT 0,
  `total_price` decimal(11,2) NOT NULL DEFAULT 0.00
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- RELATIONSHIPS FOR TABLE `orders`:
--   `user_id`
--       `users` -> `id`
--

--
-- Dumping data for table `orders`
--

INSERT INTO `orders` (`id`, `date_added`, `user_id`, `status`, `total_price`) VALUES
(2, '2024-05-28 00:00:00', 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 0, 444.44),
(10, '2024-05-28 00:00:00', 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 0, 896.00),
(13, '2024-05-29 00:00:00', 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 0, 1914.98),
(14, '2024-05-30 22:04:53', '3jrrdvJWJkhtyEk8qGIJmJJk8M92', 0, 9404.99),
(15, '2024-05-30 22:05:10', '3jrrdvJWJkhtyEk8qGIJmJJk8M92', 0, 6518.00),
(16, '2024-05-30 22:06:31', 'yGbezIdeDnPB6kSlVxFKQsO4tvD3', 0, 4802.47),
(17, '2024-06-04 17:57:17', 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 0, 17409.49),
(18, '2024-06-04 17:58:56', '3jrrdvJWJkhtyEk8qGIJmJJk8M92', 0, 20353.11),
(19, '2024-06-04 17:59:15', '3jrrdvJWJkhtyEk8qGIJmJJk8M92', 0, 10343.99),
(20, '2024-06-04 18:01:24', '3jrrdvJWJkhtyEk8qGIJmJJk8M92', 0, 597.00),
(21, '2024-06-04 18:01:34', '3jrrdvJWJkhtyEk8qGIJmJJk8M92', 0, 1797.00),
(22, '2024-06-04 18:01:43', '3jrrdvJWJkhtyEk8qGIJmJJk8M92', 0, 1958.48),
(23, '2024-06-04 18:01:55', '3jrrdvJWJkhtyEk8qGIJmJJk8M92', 0, 984.42),
(24, '2024-06-04 18:02:09', '3jrrdvJWJkhtyEk8qGIJmJJk8M92', 0, 6995.99),
(25, '2024-06-04 18:02:41', '3jrrdvJWJkhtyEk8qGIJmJJk8M92', 0, 10004.48),
(26, '2024-06-04 18:02:47', '3jrrdvJWJkhtyEk8qGIJmJJk8M92', 0, 149.00),
(27, '2024-06-04 18:03:06', '3jrrdvJWJkhtyEk8qGIJmJJk8M92', 0, 3113.49),
(28, '2024-06-04 18:03:17', '3jrrdvJWJkhtyEk8qGIJmJJk8M92', 0, 8316.00),
(29, '2024-06-04 18:03:41', '3jrrdvJWJkhtyEk8qGIJmJJk8M92', 0, 448.00),
(30, '2024-06-04 18:03:51', '3jrrdvJWJkhtyEk8qGIJmJJk8M92', 0, 419.94),
(31, '2024-06-04 18:04:09', '3jrrdvJWJkhtyEk8qGIJmJJk8M92', 0, 1891.43),
(32, '2024-06-04 18:04:34', '3jrrdvJWJkhtyEk8qGIJmJJk8M92', 0, 7043.00),
(33, '2024-06-04 18:04:45', '3jrrdvJWJkhtyEk8qGIJmJJk8M92', 0, 89.99),
(34, '2024-06-04 18:08:14', '3jrrdvJWJkhtyEk8qGIJmJJk8M92', 0, 6296.00),
(35, '2024-06-04 18:08:35', '3jrrdvJWJkhtyEk8qGIJmJJk8M92', 0, 149.00),
(36, '2024-06-04 18:09:31', 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 0, 8245.00),
(37, '2024-06-04 18:09:42', 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 0, 1897.99),
(38, '2024-06-04 18:09:59', 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 0, 7366.00),
(39, '2024-06-04 18:10:10', 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 0, 2198.00),
(40, '2024-06-04 18:10:19', 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 0, 3948.99),
(41, '2024-06-04 18:10:34', 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 0, 8852.00),
(42, '2024-06-04 18:10:52', 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 0, 3154.77),
(43, '2024-06-04 18:12:37', 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 0, 2317.00),
(44, '2024-06-04 18:12:44', 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 0, 597.00),
(45, '2024-06-04 18:12:53', 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 0, 1797.00),
(46, '2024-06-04 18:13:01', 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 0, 448.00),
(47, '2024-06-04 18:13:09', 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 0, 798.00),
(48, '2024-06-04 18:13:15', 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 0, 149.00),
(49, '2024-06-04 18:13:21', 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 0, 2457.00),
(50, '2024-06-04 18:13:29', 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 0, 6296.00),
(51, '2024-06-04 18:13:39', 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 0, 2347.99),
(52, '2024-06-04 18:17:02', 'yGbezIdeDnPB6kSlVxFKQsO4tvD3', 0, 6596.00),
(53, '2024-06-04 18:17:13', 'yGbezIdeDnPB6kSlVxFKQsO4tvD3', 0, 3870.00),
(54, '2024-06-04 18:17:23', 'yGbezIdeDnPB6kSlVxFKQsO4tvD3', 0, 7473.98),
(55, '2024-06-04 18:17:34', 'yGbezIdeDnPB6kSlVxFKQsO4tvD3', 0, 1551.86),
(56, '2024-06-04 18:17:40', 'yGbezIdeDnPB6kSlVxFKQsO4tvD3', 0, 448.00),
(57, '2024-06-04 18:18:51', 'yGbezIdeDnPB6kSlVxFKQsO4tvD3', 0, 2765.97),
(58, '2024-06-04 18:19:14', 'yGbezIdeDnPB6kSlVxFKQsO4tvD3', 0, 1614.98),
(59, '2024-06-04 18:19:24', 'yGbezIdeDnPB6kSlVxFKQsO4tvD3', 0, 179.98),
(60, '2024-06-04 18:19:34', 'yGbezIdeDnPB6kSlVxFKQsO4tvD3', 0, 1948.84),
(61, '2024-06-04 18:19:45', 'yGbezIdeDnPB6kSlVxFKQsO4tvD3', 0, 1635.00),
(62, '2024-06-04 18:19:51', 'yGbezIdeDnPB6kSlVxFKQsO4tvD3', 0, 5699.00),
(63, '2024-06-04 18:19:58', 'yGbezIdeDnPB6kSlVxFKQsO4tvD3', 0, 1998.00),
(64, '2024-06-04 18:23:27', 'yGbezIdeDnPB6kSlVxFKQsO4tvD3', 0, 597.00),
(65, '2024-06-04 18:23:35', 'yGbezIdeDnPB6kSlVxFKQsO4tvD3', 0, 7146.00),
(66, '2024-06-04 18:23:42', 'yGbezIdeDnPB6kSlVxFKQsO4tvD3', 0, 149.00),
(67, '2024-06-04 18:24:58', 'yGbezIdeDnPB6kSlVxFKQsO4tvD3', 0, 1998.00),
(68, '2024-06-04 18:25:27', 'yGbezIdeDnPB6kSlVxFKQsO4tvD3', 0, 597.00),
(69, '2024-06-04 18:25:35', 'yGbezIdeDnPB6kSlVxFKQsO4tvD3', 0, 7146.00),
(70, '2024-06-04 18:25:42', 'yGbezIdeDnPB6kSlVxFKQsO4tvD3', 0, 149.00),
(71, '2024-06-05 09:34:57', 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 0, 2774.93),
(72, '2024-06-05 11:46:19', 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 0, 2904.84),
(73, '2024-06-05 12:06:30', 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 0, 448.00);

-- --------------------------------------------------------

--
-- Table structure for table `order_items`
--
-- Creation: May 28, 2024 at 05:32 AM
-- Last update: Jun 05, 2024 at 05:06 AM
--

CREATE TABLE `order_items` (
  `id` int(11) NOT NULL,
  `order_id` int(11) NOT NULL,
  `quantity` int(11) NOT NULL,
  `product_id` int(11) NOT NULL
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

INSERT INTO `order_items` (`id`, `order_id`, `quantity`, `product_id`) VALUES
(17, 10, 2, 15),
(21, 13, 2, 10),
(22, 13, 3, 11),
(23, 13, 1, 16),
(24, 14, 1, 5),
(25, 14, 1, 21),
(26, 14, 1, 11),
(27, 14, 1, 7),
(28, 14, 2, 6),
(29, 15, 1, 7),
(30, 15, 1, 16),
(31, 15, 1, 17),
(32, 16, 3, 12),
(33, 16, 1, 9),
(34, 16, 1, 22),
(35, 16, 2, 29),
(36, 17, 1, 10),
(37, 17, 2, 7),
(38, 17, 2, 11),
(39, 17, 2, 16),
(40, 17, 4, 15),
(41, 17, 5, 21),
(42, 17, 1, 18),
(43, 17, 2, 17),
(44, 18, 1, 21),
(45, 18, 6, 5),
(46, 18, 1, 25),
(47, 18, 5, 22),
(48, 18, 1, 9),
(49, 18, 1, 17),
(50, 18, 1, 27),
(51, 18, 1, 12),
(52, 18, 1, 26),
(53, 18, 2, 13),
(54, 18, 1, 30),
(55, 18, 1, 23),
(56, 18, 1, 3),
(57, 18, 1, 1),
(58, 19, 1, 4),
(59, 19, 1, 5),
(60, 19, 1, 6),
(61, 19, 1, 7),
(62, 19, 1, 16),
(63, 19, 1, 21),
(64, 19, 1, 18),
(65, 20, 1, 15),
(66, 20, 1, 21),
(67, 21, 1, 11),
(68, 21, 1, 18),
(69, 21, 1, 16),
(70, 22, 1, 4),
(71, 22, 1, 5),
(72, 22, 1, 10),
(73, 23, 1, 12),
(74, 23, 1, 13),
(75, 23, 1, 30),
(76, 24, 1, 7),
(77, 24, 1, 15),
(78, 24, 1, 17),
(79, 24, 1, 16),
(80, 24, 1, 29),
(81, 25, 1, 4),
(82, 25, 1, 7),
(83, 25, 1, 10),
(84, 25, 3, 18),
(85, 25, 1, 29),
(86, 26, 1, 21),
(87, 27, 1, 9),
(88, 27, 1, 22),
(89, 27, 1, 12),
(90, 28, 1, 7),
(91, 28, 1, 16),
(92, 28, 1, 17),
(93, 28, 1, 18),
(94, 28, 1, 26),
(95, 29, 1, 15),
(96, 30, 2, 27),
(97, 30, 4, 29),
(98, 31, 1, 8),
(99, 31, 1, 12),
(100, 31, 1, 13),
(101, 31, 2, 23),
(102, 32, 1, 7),
(103, 32, 3, 15),
(104, 33, 1, 30),
(105, 34, 1, 7),
(106, 34, 1, 15),
(107, 34, 1, 21),
(108, 35, 1, 21),
(109, 36, 1, 7),
(110, 36, 1, 15),
(111, 36, 1, 17),
(112, 36, 1, 18),
(113, 36, 1, 26),
(114, 37, 1, 20),
(115, 37, 1, 17),
(116, 37, 1, 21),
(117, 37, 1, 27),
(118, 38, 1, 7),
(119, 38, 1, 16),
(120, 38, 1, 18),
(121, 38, 1, 21),
(122, 39, 1, 6),
(123, 39, 1, 25),
(124, 40, 1, 3),
(125, 40, 1, 17),
(126, 40, 1, 21),
(127, 41, 1, 7),
(128, 41, 1, 15),
(129, 41, 3, 16),
(130, 41, 1, 18),
(131, 41, 1, 21),
(132, 42, 1, 1),
(133, 42, 1, 13),
(134, 42, 1, 16),
(135, 42, 1, 21),
(136, 42, 1, 30),
(137, 42, 1, 23),
(138, 42, 0, 28),
(139, 43, 1, 16),
(140, 43, 1, 18),
(141, 43, 1, 26),
(142, 44, 1, 15),
(143, 44, 1, 21),
(144, 45, 1, 16),
(145, 45, 1, 11),
(146, 45, 1, 18),
(147, 46, 1, 15),
(148, 47, 1, 11),
(149, 47, 1, 16),
(150, 48, 1, 21),
(151, 49, 3, 16),
(152, 49, 3, 17),
(153, 50, 1, 7),
(154, 50, 1, 15),
(155, 50, 1, 21),
(156, 51, 1, 20),
(157, 51, 1, 25),
(158, 51, 1, 27),
(159, 52, 1, 7),
(160, 52, 1, 17),
(161, 52, 1, 15),
(162, 52, 1, 21),
(163, 53, 1, 4),
(164, 53, 2, 11),
(165, 53, 1, 17),
(166, 53, 1, 16),
(167, 53, 6, 19),
(168, 54, 1, 25),
(169, 54, 1, 22),
(170, 54, 4, 20),
(171, 54, 1, 29),
(172, 54, 1, 27),
(173, 55, 2, 13),
(174, 55, 2, 15),
(175, 55, 2, 21),
(176, 55, 2, 23),
(177, 56, 1, 15),
(178, 57, 1, 4),
(179, 57, 1, 5),
(180, 57, 1, 19),
(181, 57, 2, 10),
(182, 57, 1, 11),
(183, 58, 2, 10),
(184, 58, 2, 11),
(185, 58, 2, 19),
(186, 59, 1, 27),
(187, 59, 1, 29),
(188, 60, 2, 12),
(189, 60, 2, 13),
(190, 60, 2, 28),
(191, 61, 1, 15),
(192, 61, 2, 16),
(193, 61, 1, 21),
(194, 62, 1, 7),
(195, 63, 2, 18),
(196, 64, 1, 15),
(197, 64, 1, 21),
(198, 65, 1, 7),
(199, 65, 1, 15),
(200, 65, 1, 18),
(201, 66, 1, 21),
(202, 67, 2, 18),
(203, 68, 1, 15),
(204, 68, 1, 21),
(205, 69, 1, 7),
(206, 69, 1, 15),
(207, 69, 1, 18),
(208, 70, 1, 21),
(209, 71, 1, 15),
(210, 71, 1, 13),
(211, 71, 1, 26),
(212, 71, 1, 20),
(213, 71, 1, 21),
(214, 72, 1, 15),
(215, 72, 1, 21),
(216, 72, 1, 1),
(217, 72, 1, 30),
(218, 73, 1, 15);

-- --------------------------------------------------------

--
-- Table structure for table `products`
--
-- Creation: May 30, 2024 at 11:46 AM
-- Last update: Jun 05, 2024 at 05:45 AM
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
  `specifications` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`specifications`)),
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
(1, 'Samsung QN900B Neo QLED 8K Smart TV', 'High-end QLED 8K Smart TV with stunning picture quality', 1, 1, 2217.85, NULL, 3, 'samsung_qn900b', NULL, NULL, '2024-03-02 17:57:16', '2024-03-02 17:57:16', 5.0, 0),
(2, 'LG G2 OLED evo Gallery Edition TV', 'Gallery Edition TV with OLED 4K display', 1, 2, 3199.99, NULL, 2, 'lg_g2', NULL, NULL, '2024-03-02 17:57:57', '2024-03-02 17:57:57', 5.0, 0),
(3, 'Sony Bravia XR A95K OLED 4K Smart TV', '', 1, 3, 3499.99, 3299.99, 4, 'sony_bravia_a95k', NULL, NULL, '2024-03-02 18:00:17', '2024-03-02 18:00:17', 5.0, 0),
(4, 'Dell XPS 13 OLED 9320', 'Ultra-thin and powerful laptop with Intel Core i7 processor.', 2, 4, 999.00, 599.00, 2, 'dell_xps13', NULL, NULL, '2024-03-02 18:00:55', '2024-03-02 18:00:55', 5.0, 0),
(5, 'HP Spectre x360 14-ef0023dx', 'Convertible laptop with touch screen and sleek des...', 2, 6, 679.99, NULL, 2, 'hp_x360', NULL, NULL, '2024-03-02 18:05:22', '2024-03-02 18:05:22', 5.0, 0),
(6, 'Apple MacBook Air M2', '', 2, 5, 1299.00, 1000.00, 2, 'apple_macbook_air_m2', NULL, NULL, '2024-03-02 18:05:59', '2024-03-02 18:05:59', 5.0, 0),
(7, 'MSI MEG Trident X Gaming Desktop', '', 3, 7, 5699.00, 4000.11, 0, 'msi_trident_x', NULL, NULL, '2024-03-02 18:06:36', '2024-03-02 18:06:36', 5.0, 0),
(8, 'iPhone 14 Pro Max', '', 4, 5, 799.00, NULL, 13, 'iphone_14_pro_max', NULL, NULL, '2024-03-02 18:08:23', '2024-03-02 18:08:23', 5.0, 0),
(9, 'Samsung Galaxy S23 Ultra', '', 4, 1, 1099.99, NULL, 13, 'samsung_galaxy_s23', NULL, NULL, '2024-03-02 18:08:56', '2024-03-02 18:08:56', 5.0, 0),
(10, 'Sony WH-1000XM5 Wireless Noise-Cancelling Headphones', '', 11, 3, 279.49, NULL, 7, 'sony_wh1000xm5', NULL, NULL, '2024-03-02 18:10:24', '2024-03-02 18:10:24', 5.0, 0),
(11, 'Bose QuietComfort 45 Headphones', '', 11, 9, 279.00, NULL, 7, 'bose_qc45', NULL, NULL, '2024-03-02 18:10:58', '2024-03-02 18:10:58', 5.0, 0),
(12, 'Sonos Arc Soundbar', '', 6, 10, 814.50, NULL, 3, 'sonos_arc', NULL, NULL, '2024-03-02 18:11:48', '2024-03-02 18:11:48', 5.0, 0),
(13, 'JBL Flip 5 Portable Bluetooth Speaker', 'Portable waterproof Bluetooth speaker for outdoor use.', 6, 11, 79.93, 60.99, 1, 'jbl_flip5', NULL, NULL, '2024-03-02 18:12:19', '2024-03-02 18:12:19', 5.0, 0),
(15, 'Microsoft Xbox Series X', '', 8, 12, 448.00, NULL, 1, 'microsoft_xbox', NULL, NULL, '2024-03-02 18:15:56', '2024-03-02 18:15:56', 5.0, 0),
(16, 'Nvidia GeForce RTX 3080', 'High-end graphics card for gaming and 3D rendering...', 9, 13, 519.00, 509.99, 10, 'rtx_3080', NULL, NULL, '2024-03-02 18:16:46', '2024-03-02 18:16:46', 5.0, 0),
(17, 'AMD Ryzen 7 Processor', 'High-performance processor for gaming and content creation.', 3, 14, 300.00, NULL, 50, 'amd_ryzen7', NULL, NULL, '2024-05-30 18:41:07', '2024-05-30 18:41:07', 5.0, 0),
(18, 'Apple iPhone 13', 'Latest iPhone model with advanced camera features and iOS 15.', 4, 5, 999.00, 599.99, 100, 'apple_iphone13', NULL, NULL, '2024-05-30 18:41:07', '2024-05-30 18:41:07', 5.0, 0),
(19, 'Bose QuietComfort 35 II', 'Noise-canceling wireless headphones for immersive audio experience.', 11, 9, 249.00, NULL, 30, 'bose_qc35', NULL, NULL, '2024-05-30 18:41:07', '2024-05-30 18:41:07', 5.0, 0),
(20, 'Dell XPS 13 Laptop', 'Ultra-thin and powerful laptop with Intel Core i7 processor.', 2, 4, 1299.00, 799.99, 20, 'dell_xps13', NULL, NULL, '2024-05-30 18:41:07', '2024-05-30 18:41:07', 5.0, 0),
(21, 'Google Nest Hub', 'Smart display with Google Assistant for home automation and entertainment.', 5, 8, 149.00, NULL, 15, 'google_nest', NULL, NULL, '2024-05-30 18:41:07', '2024-05-30 18:41:07', 5.0, 0),
(22, 'HP Spectre x360', 'Convertible laptop with touch screen and sleek design.', 2, 6, 1199.00, NULL, 25, 'hp_x360', NULL, NULL, '2024-05-30 18:41:07', '2024-05-30 18:41:07', 5.0, 0),
(23, 'JBL Flip 5', 'Portable waterproof Bluetooth speaker for outdoor use.', 6, 11, 99.00, 69.25, 40, 'jbl_flip5', NULL, NULL, '2024-05-30 18:41:07', '2024-05-30 18:41:07', 5.0, 0),
(25, 'Microsoft Surface Pro 7', 'Versatile 2-in-1 tablet/laptop with Windows 10 and Surface Pen support.', 2, 12, 899.00, 599.88, 35, 'microsoft_surface', NULL, NULL, '2024-05-30 18:41:07', '2024-05-30 18:41:07', 5.0, 0),
(26, 'MSI GeForce RTX 3080', 'High-end graphics card for gaming and 3D rendering.', 9, 7, 799.00, NULL, 5, 'rtx_3080', NULL, NULL, '2024-05-30 18:41:07', '2024-05-30 18:41:07', 5.0, 0),
(27, 'XYZ Smartwatch', 'Stylish smartwatch with health tracking features.', 10, 5, 149.99, NULL, 30, 'xyz_smartwatch', NULL, NULL, '2024-05-30 18:44:42', '2024-05-30 18:44:42', 5.0, 0),
(28, 'SoundWave Pro', 'True wireless earbuds with noise cancellation.', 6, 9, 79.99, NULL, 50, 'soundwave_pro', NULL, NULL, '2024-05-30 18:44:42', '2024-05-30 18:44:42', 5.0, 0),
(29, 'PowerUp 10000', 'Compact power bank for on-the-go charging.', 10, 1, 29.99, NULL, 100, 'powerup_10000', NULL, NULL, '2024-05-30 18:44:42', '2024-05-30 18:44:42', 5.0, 0),
(30, 'BassBoom 500', 'Waterproof portable speaker with deep bass.', 6, 9, 89.99, NULL, 20, 'bassboom_500', NULL, NULL, '2024-05-30 18:44:42', '2024-05-30 18:44:42', 5.0, 0);

-- --------------------------------------------------------

--
-- Table structure for table `users`
--
-- Creation: Mar 02, 2024 at 02:39 AM
-- Last update: Jun 05, 2024 at 05:08 AM
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
('3jrrdvJWJkhtyEk8qGIJmJJk8M92', 'test3@gmail.com', '$2b$10$4qaTwuUrYvjY3N1g1Gp1AeOkPitaZcif7s.nqSaUnGGmgEBqsdDsa', 'customer2', NULL, NULL, 'Customer', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjNqcnJkdkpXSmtodHlFazhxR0lKbUpKazhNOTIiLCJlbWFpbCI6InRlc3QzQGdtYWlsLmNvbSIsImlhdCI6MTcxNzA4MTQ3MSwiZXhwIjoxNzE5NjczNDcxfQ.Fslw7WL2biTS_9XXuDCQtsF0_9yAFztuXBxcKJtmJ-k', '2024-05-30 22:04:31', '2024-06-05 09:23:17'),
('ljul8hizGLbsDwKUIjHIJYXCnFF3', 'test1@gmail.com', '$2b$10$hI67QaYzryi9sCUz7y34Suip3fMIx2rrFvQnraE6BKRR9MFc/tHsG', 'customer1', NULL, NULL, 'Customer', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImxqdWw4aGl6R0xic0R3S1VJakhJSllYQ25GRjMiLCJlbWFpbCI6InRlc3QxQGdtYWlsLmNvbSIsImlhdCI6MTcxNzM3ODk4OSwiZXhwIjoxNzE5OTcwOTg5fQ.SJ7NrABvZFbiy6Cg058wsPz8Ls-UscAqDB52zahdkQM', '2024-03-02 10:26:21', '2024-06-05 12:08:27'),
('S4eQ5Rh524MyjdHQ2EKBZHpjoCv1', 'test2@gmail.com', '$2b$10$dVYe4JIupYWsluoE1/vES.oUeFSjTaokJ7x47Exg5ne/UzCkpzR8O', 'admin123', NULL, NULL, 'Admin', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IlM0ZVE1Umg1MjRNeWpkSFEyRUtCWkhwam9DdjEiLCJlbWFpbCI6InRlc3QyQGdtYWlsLmNvbSIsImlhdCI6MTcxNzA0MDk3NCwiZXhwIjoxNzE5NjMyOTc0fQ.nS0q13LC3CR_68DmE_kQ9opO6r9B0KLeq4Q9RP5Wvvk', '2024-05-30 10:49:33', '2024-06-05 12:06:44'),
('yGbezIdeDnPB6kSlVxFKQsO4tvD3', 'test4@gmail.com', '$2b$10$QS.HJbO/ZFmjEFfvO1D1PusEMQBwFQfDcof7xvf/ZyU5dhpdmV52C', 'customer3', NULL, NULL, 'Customer', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InlHYmV6SWRlRG5QQjZrU2xWeEZLUXNPNHR2RDMiLCJlbWFpbCI6InRlc3Q0QGdtYWlsLmNvbSIsImlhdCI6MTcxNzA4MTU3MiwiZXhwIjoxNzE5NjczNTcyfQ.V3qT_-H6Al5j95qiaB-0dHgC49jn5uU1KS_PVC9LdkY', '2024-05-30 22:06:12', '2024-06-05 09:28:03');

-- --------------------------------------------------------

--
-- Table structure for table `wishlist`
--
-- Creation: Mar 09, 2024 at 04:01 AM
-- Last update: Jun 05, 2024 at 05:05 AM
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
(32, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', 18),
(30, '3jrrdvJWJkhtyEk8qGIJmJJk8M92', 27),
(25, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 5),
(23, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 7),
(9, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 10),
(17, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 11),
(28, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 15),
(22, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 16),
(29, 'ljul8hizGLbsDwKUIjHIJYXCnFF3', 21);

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
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=79;

--
-- AUTO_INCREMENT for table `cart_items`
--
ALTER TABLE `cart_items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=290;

--
-- AUTO_INCREMENT for table `categories`
--
ALTER TABLE `categories`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=12;

--
-- AUTO_INCREMENT for table `orders`
--
ALTER TABLE `orders`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=74;

--
-- AUTO_INCREMENT for table `order_items`
--
ALTER TABLE `order_items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=219;

--
-- AUTO_INCREMENT for table `wishlist`
--
ALTER TABLE `wishlist`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=35;

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
-- Constraints for table `wishlist`
--
ALTER TABLE `wishlist`
  ADD CONSTRAINT `FK_WishlistProduct` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  ADD CONSTRAINT `FK_WishlistUser` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
