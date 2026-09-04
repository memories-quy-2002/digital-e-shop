-- MySQL dump 10.13  Distrib 8.0.33, for Win64 (x86_64)
--
-- Host: e-commerce-shop-digital-e-shop.e.aivencloud.com    Database: defaultdb
-- ------------------------------------------------------
-- Server version	8.0.45

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
SET @MYSQLDUMP_TEMP_LOG_BIN = @@SESSION.SQL_LOG_BIN;
SET @@SESSION.SQL_LOG_BIN= 0;

--
-- GTID state at the beginning of the backup 
--

SET @@GLOBAL.GTID_PURGED=/*!80000 '+'*/ '053a90f3-58e9-11f1-b5cf-9a025adf1ecd:1-297,
77ef53cc-0169-11f1-9eb5-cee4b99fb32c:1-1688,
940a12f5-f4ab-11ef-a748-fa0c8011aa95:1-15,
a8ea766d-6d97-11ef-a45f-0620180db13b:1-2018,
c29426f9-9591-11ef-8ef5-0a027075d407:1-23,
c3473226-fe2a-11ef-8992-de6bd6669a7b:1-15,
c54ba3c3-f414-11f0-9a6d-aa63f2976b7a:1-15,
d38bd6ff-0ab3-11f0-9543-7aeb92d06636:1-28,
d51c5283-b8ad-11ef-a2bb-3ec33b20b424:1-15,
dad94e23-5045-11f0-8b71-1a6e22942990:1-288,
e7237df5-24b3-11f0-b79f-c2ad4b431a95:1-15,
ec14facb-250d-11f0-960e-862ccfb022e7:1-34';

--
-- Table structure for table `brands`
--

DROP TABLE IF EXISTS `brands`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `brands` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=38 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `brands`
--

/*!40000 ALTER TABLE `brands` DISABLE KEYS */;
INSERT INTO `brands` VALUES (1,'Samsung'),(2,'LG'),(3,'Sony'),(4,'Dell'),(5,'Apple'),(6,'HP'),(7,'MSI'),(8,'Google'),(9,'Bose'),(10,'Sonos'),(11,'JBL'),(12,'Microsoft'),(13,'Nvidia'),(14,'AMD'),(15,'Intel'),(32,'Asus'),(34,'Canon'),(35,'Logitech');
/*!40000 ALTER TABLE `brands` ENABLE KEYS */;

--
-- Table structure for table `cart_items`
--

DROP TABLE IF EXISTS `cart_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cart_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cart_id` int NOT NULL,
  `product_id` int NOT NULL,
  `quantity` int NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cart_items_carts_id_products_id` (`cart_id`,`product_id`),
  KEY `FK_CartItemProduct` (`product_id`),
  KEY `idx_cart_items_cart_product` (`cart_id`,`product_id`),
  CONSTRAINT `fk_cart_items_cart_id` FOREIGN KEY (`cart_id`) REFERENCES `carts` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_cart_items_product_id` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_cart_items_quantity` CHECK ((`quantity` > 0))
) ENGINE=InnoDB AUTO_INCREMENT=682 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cart_items`
--

/*!40000 ALTER TABLE `cart_items` DISABLE KEYS */;
INSERT INTO `cart_items` VALUES (618,326,161,4,'2026-05-04 04:38:08'),(621,326,153,1,'2026-05-04 04:38:23'),(625,327,180,1,'2026-05-07 04:33:16'),(626,327,182,1,'2026-05-07 04:36:13'),(627,327,149,1,'2026-05-07 04:36:24'),(629,329,142,2,'2026-05-12 05:14:01'),(631,329,56,1,'2026-05-12 05:14:09'),(637,328,171,1,'2026-05-15 03:13:27'),(638,331,171,1,'2026-05-15 03:27:09'),(639,331,174,1,'2026-05-15 03:27:10'),(642,328,1,1,'2026-05-18 09:49:05'),(643,328,4,1,'2026-05-18 09:49:07'),(645,332,131,2,'2026-05-27 03:21:21'),(646,333,13,1,'2026-05-27 03:32:33'),(647,333,4,1,'2026-05-27 03:32:33'),(669,330,174,1,'2026-05-29 07:06:40'),(670,330,178,3,'2026-05-29 07:06:41'),(671,330,167,1,'2026-05-29 07:06:42'),(672,330,159,1,'2026-05-29 07:06:43'),(677,335,182,1,'2026-05-29 08:40:27'),(678,335,180,1,'2026-05-29 08:40:28');
/*!40000 ALTER TABLE `cart_items` ENABLE KEYS */;

--
-- Table structure for table `carts`
--

DROP TABLE IF EXISTS `carts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `carts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `done` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `fk_carts_user_id` (`user_id`),
  CONSTRAINT `fk_carts_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=336 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `carts`
--

/*!40000 ALTER TABLE `carts` DISABLE KEYS */;
INSERT INTO `carts` VALUES (326,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-04 04:38:08',1),(327,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-06 08:33:44',1),(328,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-07 06:13:17',1),(329,'qiUc2rVg4jRISBWD6JzxtRFMfkJ2','2026-05-12 05:14:01',1),(330,'qiUc2rVg4jRISBWD6JzxtRFMfkJ2','2026-05-12 05:15:33',1),(331,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-15 03:27:09',1),(332,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-27 03:21:21',1),(333,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-27 03:32:33',1),(334,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-29 02:06:16',0),(335,'qiUc2rVg4jRISBWD6JzxtRFMfkJ2','2026-05-29 07:12:01',0);
/*!40000 ALTER TABLE `carts` ENABLE KEYS */;

--
-- Table structure for table `categories`
--

DROP TABLE IF EXISTS `categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `categories` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=31 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `categories`
--

/*!40000 ALTER TABLE `categories` DISABLE KEYS */;
INSERT INTO `categories` VALUES (1,'Television'),(2,'Laptop'),(3,'Desktop'),(4,'Smartphone'),(5,'Appliance'),(6,'Speaker'),(7,'Home Theater System'),(8,'Console'),(9,'Graphics Card'),(10,'Other'),(11,'Headphone'),(12,'PC'),(19,'Camera'),(20,'Application'),(22,'Phone'),(24,'Monitor'),(26,'Smartwatch');
/*!40000 ALTER TABLE `categories` ENABLE KEYS */;

--
-- Table structure for table `customer_addresses`
--

DROP TABLE IF EXISTS `customer_addresses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer_addresses` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `label` varchar(80) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'Shipping address',
  `recipient_name` varchar(160) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `phone_number` varchar(40) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `address_line` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `city` varchar(120) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `country` varchar(120) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `is_default` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `customer_addresses_user_id_idx` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `customer_addresses`
--

/*!40000 ALTER TABLE `customer_addresses` DISABLE KEYS */;
INSERT INTO `customer_addresses` VALUES (1,'ljul8hizGLbsDwKUIjHIJYXCnFF3','Home','Manh Phu Quy Nguyen','0123456789','ABC Street, Tan Thoi Hiep Ward','Ho Chi Minh City','Vietnam',1,'2026-05-15 03:36:11','2026-05-15 08:39:23'),(3,'qiUc2rVg4jRISBWD6JzxtRFMfkJ2','Home','Manh Phu Quy Nguyen','0123456789','123 ABC Street, Tan Thoi Hiep Ward','Ho Chi Minh City','Vietnam',1,'2026-05-28 01:49:39','2026-05-28 01:49:39');
/*!40000 ALTER TABLE `customer_addresses` ENABLE KEYS */;

--
-- Table structure for table `customer_notifications`
--

DROP TABLE IF EXISTS `customer_notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer_notifications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `type` varchar(40) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'order',
  `title` varchar(160) COLLATE utf8mb4_general_ci NOT NULL,
  `message` varchar(500) COLLATE utf8mb4_general_ci NOT NULL,
  `link` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `read_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `customer_notifications_user_id_idx` (`user_id`),
  KEY `customer_notifications_created_at_idx` (`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `customer_notifications`
--

/*!40000 ALTER TABLE `customer_notifications` DISABLE KEYS */;
INSERT INTO `customer_notifications` VALUES (1,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','order','Order #209 was placed','Your order total is $344.99. We will update this timeline as the order moves forward.','/orders?order=209','2026-05-15 03:28:35','2026-05-15 03:28:24'),(2,'ljul8hizGLbsDwKUIjHIJYXCnFF3','order','Order #210 was placed','Your order total is $2658.98. We will update this timeline as the order moves forward.','/orders?order=210','2026-05-25 08:14:20','2026-05-25 08:14:08'),(3,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','order','Order #209 is completed','The order status changed to completed. Open your order history to see the full timeline.','/orders?order=209','2026-05-27 02:01:09','2026-05-25 08:15:05'),(4,'ljul8hizGLbsDwKUIjHIJYXCnFF3','order','Order #210 is canceled','The order status changed to canceled. Open your order history to see the full timeline.','/orders?order=210','2026-05-25 08:18:36','2026-05-25 08:15:06'),(5,'ljul8hizGLbsDwKUIjHIJYXCnFF3','order','Order #211 was placed','Your order total is $2598.00. We will update this timeline as the order moves forward.','/orders?order=211','2026-05-27 03:33:30','2026-05-27 03:21:48'),(6,'ljul8hizGLbsDwKUIjHIJYXCnFF3','order','Order #212 was placed','Your order total is $494.99. We will update this timeline as the order moves forward.','/orders?order=212','2026-05-27 03:33:30','2026-05-27 03:33:25'),(7,'ljul8hizGLbsDwKUIjHIJYXCnFF3','order','Order #211 is completed','The order status changed to completed. Open your order history to see the full timeline.','/orders?order=211','2026-05-28 02:04:19','2026-05-27 07:11:48'),(8,'ljul8hizGLbsDwKUIjHIJYXCnFF3','order','Order #212 is completed','The order status changed to completed. Open your order history to see the full timeline.','/orders?order=212','2026-05-28 02:04:19','2026-05-27 07:11:48'),(9,'AObfEe54ppXfrushcDpgypEj1gH3','order','Order #204 is canceled','The order status changed to canceled. Open your order history to see the full timeline.','/orders?order=204',NULL,'2026-05-27 07:12:09'),(10,'AObfEe54ppXfrushcDpgypEj1gH3','order','Order #201 is completed','The order status changed to completed. Open your order history to see the full timeline.','/orders?order=201',NULL,'2026-05-27 07:12:11'),(11,'qiUc2rVg4jRISBWD6JzxtRFMfkJ2','order','Order #213 was placed','Your order total is $1495.16. We will update this timeline as the order moves forward.','/orders?order=213','2026-05-29 08:39:58','2026-05-29 07:11:50'),(12,'qiUc2rVg4jRISBWD6JzxtRFMfkJ2','order','Order #213 is completed','The order status changed to completed. Open your order history to see the full timeline.','/orders?order=213',NULL,'2026-05-29 09:25:48');
/*!40000 ALTER TABLE `customer_notifications` ENABLE KEYS */;

--
-- Table structure for table `customer_sessions`
--

DROP TABLE IF EXISTS `customer_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer_sessions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `session_start` datetime DEFAULT NULL,
  `session_end` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_customer_sessions_user_id_session_start` (`user_id`,`session_start`),
  CONSTRAINT `fk_customer_sessions_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=1461 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `customer_sessions`
--

/*!40000 ALTER TABLE `customer_sessions` DISABLE KEYS */;
INSERT INTO `customer_sessions` VALUES (1384,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-04 11:37:56',NULL),(1385,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-04 04:41:30',NULL),(1386,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-06 13:18:33','2026-05-06 13:25:18'),(1387,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-06 13:25:28','2026-05-06 13:36:14'),(1388,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-06 13:36:24','2026-05-06 13:45:01'),(1389,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-06 13:45:10','2026-05-06 13:45:32'),(1390,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-06 13:45:37','2026-05-06 14:21:54'),(1391,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-06 13:57:50',NULL),(1392,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-06 07:17:06','2026-05-07 04:36:56'),(1393,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-06 14:21:59',NULL),(1394,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-06 14:40:20','2026-05-06 15:24:54'),(1395,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-06 15:24:59','2026-05-11 08:29:58'),(1396,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-07 04:37:01',NULL),(1397,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-07 06:13:11',NULL),(1398,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-11 01:09:16','2026-05-15 06:27:50'),(1399,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-11 08:30:04',NULL),(1400,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-12 10:33:26','2026-05-12 10:47:34'),(1401,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-12 10:47:50','2026-05-12 11:00:19'),(1402,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-12 11:00:37',NULL),(1403,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-12 11:22:08','2026-05-12 11:23:27'),(1404,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-12 11:23:47','2026-05-12 11:43:27'),(1405,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-12 12:09:22',NULL),(1406,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-12 12:12:57','2026-05-12 12:13:36'),(1407,'qiUc2rVg4jRISBWD6JzxtRFMfkJ2','2026-05-12 12:13:42','2026-05-12 12:14:11'),(1408,'qiUc2rVg4jRISBWD6JzxtRFMfkJ2','2026-05-12 12:14:17',NULL),(1409,'qiUc2rVg4jRISBWD6JzxtRFMfkJ2','2026-05-12 12:56:55','2026-05-12 12:57:14'),(1410,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-12 12:57:21',NULL),(1411,'qiUc2rVg4jRISBWD6JzxtRFMfkJ2','2026-05-13 08:06:56',NULL),(1412,'qiUc2rVg4jRISBWD6JzxtRFMfkJ2','2026-05-13 08:25:09',NULL),(1413,'qiUc2rVg4jRISBWD6JzxtRFMfkJ2','2026-05-13 08:34:26','2026-05-13 09:20:12'),(1414,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-13 09:20:18',NULL),(1415,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-13 10:16:58',NULL),(1416,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-13 10:19:58',NULL),(1417,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-13 10:35:13','2026-05-13 10:36:05'),(1418,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-13 10:36:09','2026-05-13 10:40:36'),(1419,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-13 10:40:41','2026-05-13 10:42:09'),(1420,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-13 10:42:13',NULL),(1421,'qiUc2rVg4jRISBWD6JzxtRFMfkJ2','2026-05-15 08:49:48',NULL),(1422,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-15 09:03:04','2026-05-15 09:19:36'),(1423,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-15 09:19:39','2026-05-15 10:35:34'),(1424,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-15 10:35:41','2026-05-27 08:47:55'),(1425,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-15 06:27:08',NULL),(1426,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-15 06:27:14',NULL),(1427,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-15 06:27:25',NULL),(1428,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-15 06:27:29',NULL),(1429,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-15 06:27:57',NULL),(1430,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-15 15:34:31',NULL),(1431,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-18 09:48:53','2026-05-25 08:14:29'),(1432,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-25 09:55:23',NULL),(1433,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-25 08:14:37','2026-05-25 08:18:19'),(1434,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-25 08:18:32',NULL),(1435,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-27 01:32:58','2026-05-27 01:38:06'),(1436,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-27 01:38:10',NULL),(1437,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-27 08:48:02','2026-05-27 09:01:13'),(1438,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-27 09:01:19','2026-05-27 10:54:48'),(1439,'qiUc2rVg4jRISBWD6JzxtRFMfkJ2','2026-05-27 10:55:04','2026-05-27 13:09:48'),(1440,'qiUc2rVg4jRISBWD6JzxtRFMfkJ2','2026-05-27 13:09:52',NULL),(1441,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-27 13:37:45',NULL),(1442,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-27 14:02:07','2026-05-27 14:10:26'),(1443,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-27 14:10:33','2026-05-27 14:13:35'),(1444,'qiUc2rVg4jRISBWD6JzxtRFMfkJ2','2026-05-27 14:13:40',NULL),(1445,'qiUc2rVg4jRISBWD6JzxtRFMfkJ2','2026-05-27 15:57:32',NULL),(1446,'qiUc2rVg4jRISBWD6JzxtRFMfkJ2','2026-05-28 08:44:21','2026-05-28 08:55:41'),(1447,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-28 08:55:46','2026-05-28 09:06:41'),(1448,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-28 09:16:24',NULL),(1449,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-29 09:05:33','2026-05-29 10:02:17'),(1450,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-29 10:02:23',NULL),(1451,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-29 10:18:52','2026-05-29 10:46:43'),(1452,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-29 10:46:50',NULL),(1453,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-29 11:02:17',NULL),(1454,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-29 11:20:00','2026-05-29 11:29:14'),(1455,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-29 11:33:10',NULL),(1456,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-29 13:50:21',NULL),(1457,'qiUc2rVg4jRISBWD6JzxtRFMfkJ2','2026-05-29 07:06:35','2026-05-29 09:24:34'),(1458,'qiUc2rVg4jRISBWD6JzxtRFMfkJ2','2026-05-29 15:39:54',NULL),(1459,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-29 09:24:47',NULL),(1460,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-29 09:46:59',NULL);
/*!40000 ALTER TABLE `customer_sessions` ENABLE KEYS */;

--
-- Table structure for table `discounts`
--

DROP TABLE IF EXISTS `discounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `discounts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `discount_code` varchar(50) COLLATE utf8mb4_general_ci NOT NULL,
  `description` text COLLATE utf8mb4_general_ci,
  `discount_percent` decimal(5,2) NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `min_order_value` decimal(10,2) NOT NULL DEFAULT '0.00',
  `starts_at` datetime DEFAULT NULL,
  `expires_at` datetime DEFAULT NULL,
  `usage_limit` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_discounts_code` (`discount_code`),
  CONSTRAINT `chk_discounts_discount_percent` CHECK (((`discount_percent` > 0.00) and (`discount_percent` <= 100.00)))
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `discounts`
--

/*!40000 ALTER TABLE `discounts` DISABLE KEYS */;
INSERT INTO `discounts` VALUES (1,'SUMMER20','10% off for summer sale',20.00,0,0.00,NULL,'2026-06-15 00:02:00',NULL),(2,'HOLIDAY20','20% off for holiday season',20.00,1,0.00,'2026-05-13 02:21:00','2026-06-15 07:02:00',NULL),(3,'NEWCUSTOMER15','15% off for new customers',15.00,1,0.00,NULL,'2026-06-15 00:02:00',NULL),(4,'SPRING25',NULL,25.00,1,0.00,'2026-05-13 02:21:00','2026-06-15 07:02:00',NULL),(5,'DIGITALE10',NULL,10.00,1,0.00,NULL,NULL,NULL);
/*!40000 ALTER TABLE `discounts` ENABLE KEYS */;

--
-- Table structure for table `inventory_movements`
--

DROP TABLE IF EXISTS `inventory_movements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inventory_movements` (
  `id` int NOT NULL AUTO_INCREMENT,
  `product_id` int NOT NULL,
  `order_id` int DEFAULT NULL,
  `movement_type` varchar(40) COLLATE utf8mb4_general_ci NOT NULL,
  `quantity_change` int NOT NULL,
  `stock_before` int DEFAULT NULL,
  `stock_after` int DEFAULT NULL,
  `note` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `actor_id` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `inventory_movements_product_id_idx` (`product_id`),
  KEY `inventory_movements_created_at_idx` (`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inventory_movements`
--

/*!40000 ALTER TABLE `inventory_movements` DISABLE KEYS */;
INSERT INTO `inventory_movements` VALUES (1,171,209,'sale',-1,7,6,'Stock deducted for order #209','S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-15 03:28:25'),(2,174,209,'sale',-1,98,97,'Stock deducted for order #209','S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-15 03:28:25'),(3,1,210,'sale',-1,45,44,'Stock deducted for order #210','ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-25 08:14:10'),(4,4,210,'sale',-1,25,24,'Stock deducted for order #210','ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-25 08:14:10'),(5,171,210,'sale',-1,6,5,'Stock deducted for order #210','ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-25 08:14:10'),(6,104,NULL,'manual_adjustment',14,1,15,'Inventory updated from admin quick restock','S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-25 08:15:47'),(7,143,NULL,'manual_adjustment',9,1,10,'Inventory updated from admin quick restock','S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-25 08:15:54'),(8,127,NULL,'manual_adjustment',12,3,15,'Inventory updated from admin quick restock','S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-25 08:15:56'),(9,171,NULL,'manual_adjustment',0,5,5,'Inventory updated from admin quick restock','S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-27 01:48:37'),(10,171,NULL,'manual_adjustment',1,5,6,'Inventory updated from admin quick restock','S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-27 01:48:42'),(11,131,211,'sale',-2,28,26,'Stock deducted for order #211','ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-27 03:21:48'),(12,4,212,'sale',-1,24,23,'Stock deducted for order #212','ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-27 03:33:25'),(13,13,212,'sale',-1,57,56,'Stock deducted for order #212','ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-27 03:33:25'),(14,159,213,'sale',-1,70,69,'Stock deducted for order #213','qiUc2rVg4jRISBWD6JzxtRFMfkJ2','2026-05-29 07:11:50'),(15,167,213,'sale',-1,52,51,'Stock deducted for order #213','qiUc2rVg4jRISBWD6JzxtRFMfkJ2','2026-05-29 07:11:50'),(16,174,213,'sale',-1,97,96,'Stock deducted for order #213','qiUc2rVg4jRISBWD6JzxtRFMfkJ2','2026-05-29 07:11:50'),(17,178,213,'sale',-3,11,8,'Stock deducted for order #213','qiUc2rVg4jRISBWD6JzxtRFMfkJ2','2026-05-29 07:11:50');
/*!40000 ALTER TABLE `inventory_movements` ENABLE KEYS */;

--
-- Table structure for table `order_items`
--

DROP TABLE IF EXISTS `order_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `order_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL,
  `quantity` int NOT NULL,
  `product_id` int NOT NULL,
  `total_price` decimal(11,2) NOT NULL DEFAULT '0.00',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_order_items_order_id_product_id` (`order_id`,`product_id`),
  KEY `FK_ProductOrderItem` (`product_id`),
  KEY `idx_order_items_order_product` (`order_id`,`product_id`),
  CONSTRAINT `fk_order_items_order_id` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_order_items_product_id` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=484 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `order_items`
--

/*!40000 ALTER TABLE `order_items` DISABLE KEYS */;
INSERT INTO `order_items` VALUES (415,186,1,153,49.00),(416,186,4,161,4796.00),(417,187,1,149,109.00),(418,187,1,180,39.99),(419,187,1,182,179.99),(420,188,1,56,2500.00),(421,188,2,142,1798.00),(422,189,1,182,179.99),(423,190,2,179,139.98),(424,190,1,178,29.99),(425,191,1,176,199.99),(426,191,2,175,999.98),(427,191,1,174,399.99),(428,192,2,173,499.98),(429,192,1,172,89.99),(430,192,2,171,119.98),(431,192,1,170,99.99),(432,193,1,170,99.99),(433,194,2,167,159.98),(434,194,1,162,1699.00),(435,195,1,160,349.00),(436,195,2,159,2598.00),(437,195,1,158,649.00),(438,196,2,157,398.00),(439,196,1,156,599.00),(440,196,2,155,2998.00),(441,196,1,154,649.00),(442,197,1,154,649.00),(443,198,2,151,1798.00),(444,198,1,150,149.00),(445,199,1,148,649.00),(446,199,2,147,598.00),(447,199,1,146,499.00),(448,200,2,145,498.00),(449,200,1,144,199.00),(450,200,2,143,458.00),(451,200,1,142,899.00),(452,201,1,142,899.00),(453,202,2,139,278.00),(454,202,1,182,179.99),(455,203,1,180,39.99),(456,203,2,179,139.98),(457,203,1,178,29.99),(458,204,2,177,99.98),(459,204,1,176,199.99),(460,204,2,175,999.98),(461,204,1,174,399.99),(462,205,1,174,399.99),(463,206,2,171,119.98),(464,206,1,170,99.99),(465,207,1,168,129.99),(466,207,2,167,159.98),(467,207,1,162,1699.00),(468,208,2,161,2398.00),(469,208,1,160,349.00),(470,208,2,159,2598.00),(471,208,1,158,649.00),(472,209,1,171,59.99),(473,209,1,174,399.99),(474,210,1,1,1999.99),(475,210,1,4,599.00),(476,210,1,171,59.99),(477,211,2,131,2598.00),(478,212,1,4,599.00),(479,212,1,13,60.99),(480,213,1,159,1299.00),(481,213,1,167,79.99),(482,213,1,174,399.99),(483,213,3,178,89.97);
/*!40000 ALTER TABLE `order_items` ENABLE KEYS */;

--
-- Table structure for table `order_status_events`
--

DROP TABLE IF EXISTS `order_status_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `order_status_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL,
  `status` int NOT NULL,
  `label` varchar(80) COLLATE utf8mb4_general_ci NOT NULL,
  `note` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `actor_id` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `order_status_events_order_id_idx` (`order_id`),
  KEY `order_status_events_created_at_idx` (`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `order_status_events`
--

/*!40000 ALTER TABLE `order_status_events` DISABLE KEYS */;
INSERT INTO `order_status_events` VALUES (1,209,0,'Placed','Order was placed by the customer.','S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-15 03:28:24'),(2,210,0,'Placed','Order was placed by the customer.','ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-25 08:14:08'),(3,209,1,'Completed','Order status changed to 1.','S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-25 08:15:05'),(4,210,2,'Canceled','Order status changed to 2.','S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-25 08:15:06'),(5,211,0,'Placed','Order was placed by the customer.','ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-27 03:21:48'),(6,212,0,'Placed','Order was placed by the customer.','ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-27 03:33:25'),(7,211,1,'Completed','Order status changed to 1.','S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-27 07:11:48'),(8,212,1,'Completed','Order status changed to 1.','S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-27 07:11:48'),(9,204,2,'Canceled','Order status changed to 2.','S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-27 07:12:09'),(10,201,1,'Completed','Order status changed to 1.','S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-27 07:12:11'),(11,213,0,'Placed','Order was placed by the customer.','qiUc2rVg4jRISBWD6JzxtRFMfkJ2','2026-05-29 07:11:50'),(12,213,1,'Completed','Order status changed to 1.','S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-29 09:25:47');
/*!40000 ALTER TABLE `order_status_events` ENABLE KEYS */;

--
-- Table structure for table `orders`
--

DROP TABLE IF EXISTS `orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `orders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `date_added` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `user_id` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `status` int NOT NULL DEFAULT '0',
  `total_price` decimal(11,2) NOT NULL,
  `discount` decimal(11,2) NOT NULL DEFAULT '0.00',
  `shipping_address` text COLLATE utf8mb4_general_ci NOT NULL,
  `payment_method` varchar(32) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'cash',
  PRIMARY KEY (`id`),
  KEY `idx_orders_user` (`user_id`),
  CONSTRAINT `fk_orders_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `chk_orders_total_price` CHECK ((`total_price` > 0))
) ENGINE=InnoDB AUTO_INCREMENT=214 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `orders`
--

/*!40000 ALTER TABLE `orders` DISABLE KEYS */;
INSERT INTO `orders` VALUES (186,'2026-05-06 07:21:45','ljul8hizGLbsDwKUIjHIJYXCnFF3',1,4845.00,969.00,'TTH Ward','cash'),(187,'2026-05-07 04:36:50','ljul8hizGLbsDwKUIjHIJYXCnFF3',1,328.98,0.00,'FPT','bank_transfer'),(188,'2026-05-12 05:15:24','qiUc2rVg4jRISBWD6JzxtRFMfkJ2',1,4298.00,0.00,'FPT F-town 1','cash'),(189,'2026-05-13 09:00:00','AObfEe54ppXfrushcDpgypEj1gH3',2,179.99,18.00,'12 Nguyen Hue Street, District 1, Ho Chi Minh City','bank_transfer'),(190,'2026-05-12 10:07:00','qiUc2rVg4jRISBWD6JzxtRFMfkJ2',1,169.97,0.00,'45 Le Loi Street, District 3, Ho Chi Minh City','cash'),(191,'2026-05-11 11:14:00','ljul8hizGLbsDwKUIjHIJYXCnFF3',1,1599.96,0.00,'88 Vo Van Tan Street, District 3, Ho Chi Minh City','bank_transfer'),(192,'2026-05-10 12:21:00','AObfEe54ppXfrushcDpgypEj1gH3',1,809.94,0.00,'27 Tran Hung Dao Street, District 5, Ho Chi Minh City','cash'),(193,'2026-05-09 13:28:00','qiUc2rVg4jRISBWD6JzxtRFMfkJ2',1,99.99,0.00,'101 Pasteur Street, District 1, Ho Chi Minh City','bank_transfer'),(194,'2026-05-08 14:35:00','ljul8hizGLbsDwKUIjHIJYXCnFF3',1,1858.98,185.90,'19 Ly Thuong Kiet Street, District 10, Ho Chi Minh City','cash'),(195,'2026-05-07 15:42:00','AObfEe54ppXfrushcDpgypEj1gH3',1,3596.00,0.00,'12 Nguyen Hue Street, District 1, Ho Chi Minh City','bank_transfer'),(196,'2026-05-06 16:49:00','qiUc2rVg4jRISBWD6JzxtRFMfkJ2',1,4644.00,0.00,'45 Le Loi Street, District 3, Ho Chi Minh City','cash'),(197,'2026-05-05 17:56:00','ljul8hizGLbsDwKUIjHIJYXCnFF3',1,649.00,0.00,'88 Vo Van Tan Street, District 3, Ho Chi Minh City','bank_transfer'),(198,'2026-05-04 18:03:00','AObfEe54ppXfrushcDpgypEj1gH3',2,1947.00,0.00,'27 Tran Hung Dao Street, District 5, Ho Chi Minh City','cash'),(199,'2026-05-03 09:10:00','qiUc2rVg4jRISBWD6JzxtRFMfkJ2',1,1746.00,174.60,'101 Pasteur Street, District 1, Ho Chi Minh City','bank_transfer'),(200,'2026-05-02 10:17:00','ljul8hizGLbsDwKUIjHIJYXCnFF3',1,2054.00,0.00,'19 Ly Thuong Kiet Street, District 10, Ho Chi Minh City','cash'),(201,'2026-05-01 11:24:00','AObfEe54ppXfrushcDpgypEj1gH3',1,899.00,0.00,'12 Nguyen Hue Street, District 1, Ho Chi Minh City','bank_transfer'),(202,'2026-04-30 12:31:00','qiUc2rVg4jRISBWD6JzxtRFMfkJ2',1,457.99,0.00,'45 Le Loi Street, District 3, Ho Chi Minh City','cash'),(203,'2026-04-29 13:38:00','ljul8hizGLbsDwKUIjHIJYXCnFF3',1,209.96,0.00,'88 Vo Van Tan Street, District 3, Ho Chi Minh City','bank_transfer'),(204,'2026-04-28 14:45:00','AObfEe54ppXfrushcDpgypEj1gH3',2,1699.94,169.99,'27 Tran Hung Dao Street, District 5, Ho Chi Minh City','cash'),(205,'2026-04-27 15:52:00','qiUc2rVg4jRISBWD6JzxtRFMfkJ2',1,399.99,0.00,'101 Pasteur Street, District 1, Ho Chi Minh City','bank_transfer'),(206,'2026-04-26 16:59:00','ljul8hizGLbsDwKUIjHIJYXCnFF3',1,219.97,0.00,'19 Ly Thuong Kiet Street, District 10, Ho Chi Minh City','cash'),(207,'2026-04-25 17:06:00','AObfEe54ppXfrushcDpgypEj1gH3',2,1988.97,0.00,'12 Nguyen Hue Street, District 1, Ho Chi Minh City','bank_transfer'),(208,'2026-04-24 18:13:00','qiUc2rVg4jRISBWD6JzxtRFMfkJ2',1,5994.00,0.00,'45 Le Loi Street, District 3, Ho Chi Minh City','cash'),(209,'2026-05-15 03:28:24','S4eQ5Rh524MyjdHQ2EKBZHpjoCv1',1,459.98,115.00,'FPT F-town 1, D1 Street, Tang Nhon Phu Ward','cash'),(210,'2026-05-25 08:14:07','ljul8hizGLbsDwKUIjHIJYXCnFF3',2,2658.98,0.00,'FPT F-Town 1, D1 Street, Tang Nhon Phu Ward','cash'),(211,'2026-05-27 03:21:47','ljul8hizGLbsDwKUIjHIJYXCnFF3',1,2598.00,0.00,'ABC Street, Tan Thoi Hiep Ward','bank_transfer'),(212,'2026-05-27 03:33:25','ljul8hizGLbsDwKUIjHIJYXCnFF3',1,659.99,165.00,'FPT F-Town 1, D1 Street, Tang Nhon Phu Ward','cash'),(213,'2026-05-29 07:11:49','qiUc2rVg4jRISBWD6JzxtRFMfkJ2',1,1868.95,373.79,'123 ABC Street, Tan Thoi Hiep Ward','bank_transfer');
/*!40000 ALTER TABLE `orders` ENABLE KEYS */;

--
-- Table structure for table `products`
--

DROP TABLE IF EXISTS `products`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `products` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'No description available',
  `category_id` int NOT NULL,
  `brand_id` int NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `sale_price` decimal(10,2) DEFAULT NULL,
  `stock` int NOT NULL DEFAULT '0',
  `main_image` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `specifications` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_products_category_brand_rating` (`category_id`,`brand_id`,`id`),
  KEY `idx_products_brand` (`brand_id`),
  KEY `idx_products_category` (`category_id`),
  CONSTRAINT `fk_products_brand_id_brands` FOREIGN KEY (`brand_id`) REFERENCES `brands` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_products_category_id_categories` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_products_price` CHECK ((`price` > 0))
) ENGINE=InnoDB AUTO_INCREMENT=183 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `products`
--

/*!40000 ALTER TABLE `products` DISABLE KEYS */;
INSERT INTO `products` VALUES (1,'Samsung QN900B Neo QLED 8K Smart TV','High-end QLED 8K Smart TV with stunning picture quality',1,1,2217.25,1999.99,44,'samsung-qn900b-neo-qled-8k-smart-tv','{\"version\":1,\"model\":\"\",\"warranty\":\"\",\"datasheet\":\"\",\"highlights\":[],\"specifications\":[]}','2024-03-02 17:57:16','2024-03-02 17:57:16'),(2,'LG G2 OLED evo Gallery Edition TV','Gallery Edition TV with OLED 4K display',1,2,3199.99,NULL,14,'lg-g2-oled-evo-gallery-edition-tv',NULL,'2024-03-02 17:57:57','2024-03-02 17:57:57'),(4,'Dell XPS 13 OLED 9320','Ultra-thin and powerful laptop with Intel Core i7 processor.',2,4,999.00,599.00,23,'dell-xps-13-oled-9320',NULL,'2024-03-02 18:00:55','2024-03-02 18:00:55'),(5,'HP Spectre x360 14-ef0023dx','Convertible laptop with touch screen and sleek des...',2,6,679.99,NULL,87,'hp-spectre-x360-14-ef0023dx',NULL,'2024-03-02 18:05:22','2024-03-02 18:05:22'),(13,'JBL Flip 5 Portable Bluetooth Speaker','Portable waterproof Bluetooth speaker for outdoor use.',6,11,79.93,60.99,56,'jbl-flip-5-portable-bluetooth-speaker',NULL,'2024-03-02 18:12:19','2024-03-02 18:12:19'),(17,'AMD Ryzen 7 Processor','High-performance processor for gaming and content creation.',3,14,300.00,NULL,27,'amd-ryzen-7-processor',NULL,'2024-05-30 18:41:07','2024-05-30 18:41:07'),(18,'Apple iPhone 13','Latest iPhone model with advanced camera features and iOS 15.',4,5,999.00,599.99,63,'apple-iphone-13',NULL,'2024-05-30 18:41:07','2024-05-30 18:41:07'),(19,'Bose QuietComfort 35 II','Noise-canceling wireless headphones for immersive audio experience.',11,9,249.00,NULL,33,'bose-quietcomfort-35-ii',NULL,'2024-05-30 18:41:07','2024-05-30 18:41:07'),(21,'Google Nest Hub','Smart display with Google Assistant for home automation and entertainment.',5,8,149.00,NULL,78,'google-nest-hub',NULL,'2024-05-30 18:41:07','2024-05-30 18:41:07'),(25,'Microsoft Surface Pro 7','Versatile 2-in-1 tablet/laptop with Windows 10 and Surface Pen support.',2,12,899.00,599.88,92,'microsoft-surface-pro-7',NULL,'2024-05-30 18:41:07','2024-05-30 18:41:07'),(26,'MSI GeForce RTX 3080','High-end graphics card for gaming and 3D rendering.',9,7,799.00,NULL,25,'msi-geforce-rtx-3080',NULL,'2024-05-30 18:41:07','2024-05-30 18:41:07'),(28,'SoundWave Pro','True wireless earbuds with noise cancellation.',6,9,79.99,NULL,51,'soundwave-pro',NULL,'2024-05-30 18:44:42','2024-05-30 18:44:42'),(29,'PowerUp 10000','Compact power bank for on-the-go charging.',10,1,29.99,NULL,79,'powerup-10000',NULL,'2024-05-30 18:44:42','2024-05-30 18:44:42'),(30,'BassBoom 500','Waterproof portable speaker with deep bass.',6,9,89.99,NULL,45,'bassboom-500',NULL,'2024-05-30 18:44:42','2024-05-30 18:44:42'),(38,'PC i5-12400F','Lorem ipsum odor amet, consectetuer adipiscing elit. Consequat dapibus velit ultrices lacinia blandit risus aptent. Senectus mus nam nec vehicula Bibendum fusce.',12,15,250.00,NULL,88,'pc-i5-12400f','Lorem ipsum odor amet, consectetuer adipiscing elit. Consequat dapibus velit ultrices lacinia blandit risus aptent. Senectus mus nam nec vehicula Bibendum fusce.','2024-08-29 12:22:18','2024-08-29 12:22:18'),(56,'PixelMaster 8500','A full-frame DSLR camera with advanced features and exceptional image quality. Ideal for professional photographers and enthusiasts who demand the',19,34,2500.00,NULL,6,'pixelmaster-8500','45-megapixel full-frame sensor, 5-axis image stabilization, 4K video recording, 10fps continuous shooting, weather-sealed body','2024-09-13 01:41:24','2024-09-13 01:41:24'),(93,'Samsung Galaxy S22','Samsung\'s flagship phone with a 6.1-inch AMOLED display, Exynos 2200, and triple-camera system.',22,1,999.00,NULL,70,'samsung-galaxy-s22','256GB storage, 8GB RAM, Android 12','2024-09-16 00:53:46','2024-09-16 00:53:46'),(94,'LG 27-inch UltraFine 4K Monitor','A 27-inch 4K monitor with USB-C connectivity, ideal for creative professionals.',24,2,699.00,NULL,31,'lg-27-inch-ultrafine-4k-monitor','4K UHD, 60Hz refresh rate, USB-C, HDR10','2024-09-16 00:55:43','2024-09-16 00:55:43'),(95,'Apple MacBook Pro M3','The latest MacBook Pro with the Apple M3 chip, 14-inch Retina display, and powerful performance for developers and content creators.',2,5,2499.00,NULL,43,'apple-macbook-pro-m3','M3 chip, 16GB RAM, 512GB SSD, macOS Sonoma','2024-09-16 01:18:56','2024-09-16 01:18:56'),(97,'Google Pixel Watch 2','Google\'s new smartwatch with health tracking sensors, AMOLED display, and up to 48 hours of battery life.',26,8,399.00,NULL,22,'google-pixel-watch-2','AMOLED, Wear OS, 48-hour battery, health sensors','2024-09-16 01:25:15','2024-09-16 01:25:15'),(99,'Dell Latitude 7450','Business laptop with strong performance and long battery life.',2,4,1299.00,1099.00,82,'dell-latitude-7450','14-inch, i7, 16GB RAM, 512GB SSD','2026-04-08 01:29:54','2026-04-08 01:29:54'),(100,'Asus ZenBook 14 OLED','Slim OLED laptop for creators and everyday work.',2,32,1199.00,999.00,43,'asus-zenbook-14-oled','14-inch OLED, i5, 16GB RAM, 512GB SSD','2026-04-08 01:29:54','2026-04-08 01:29:54'),(101,'HP Envy 16','Large-screen laptop built for productivity and media.',2,6,1399.00,NULL,72,'hp-envy-16','16-inch, i7, 16GB RAM, 1TB SSD','2026-04-08 01:29:54','2026-04-08 01:29:54'),(102,'Apple MacBook Air M3 15','Thin and light laptop with Apple M3 chip.',2,5,1499.00,1399.00,31,'apple-macbook-air-m3-15','15-inch, M3, 16GB RAM, 512GB SSD','2026-04-08 01:29:54','2026-04-08 01:29:54'),(103,'MSI Stealth 16 AI','Gaming laptop with advanced GPU and fast display.',2,7,2199.00,1999.00,39,'msi-stealth-16-ai','16-inch 240Hz, i9, RTX 4070, 32GB RAM','2026-04-08 01:29:54','2026-04-08 01:29:54'),(104,'Samsung Odyssey G7 27','Curved gaming monitor with high refresh rate.',24,1,699.00,599.00,15,'samsung-odyssey-g7-27','27-inch QHD, 240Hz, 1ms','2026-04-08 01:29:54','2026-04-08 01:29:54'),(105,'LG UltraFine 32 4K','Large 4K monitor with USB-C connectivity.',24,2,899.00,NULL,89,'lg-ultrafine-32-4k','32-inch 4K, HDR, USB-C','2026-04-08 01:29:54','2026-04-08 01:29:54'),(106,'Dell UltraSharp 34','Ultrawide monitor for multitasking.',24,4,999.00,899.00,44,'dell-ultrasharp-34','34-inch UWQHD, 60Hz, USB-C','2026-04-08 01:29:54','2026-04-08 01:29:54'),(107,'Sony WH-CH720N','Lightweight noise-cancelling headphones.',11,3,149.00,129.00,52,'sony-wh-ch720n','Bluetooth, ANC, 35h battery','2026-04-08 01:29:54','2026-04-08 01:29:54'),(108,'Bose QuietComfort Ultra','Premium noise cancelling headphones.',11,9,429.00,399.00,27,'bose-quietcomfort-ultra','ANC, spatial audio, 24h battery','2026-04-08 01:29:54','2026-04-08 01:29:54'),(109,'JBL Charge 5','Portable speaker with deep bass and long battery.',6,11,179.00,149.00,81,'jbl-charge-5','IP67, 20h battery, USB-C','2026-04-08 01:29:54','2026-04-08 01:29:54'),(110,'Sonos Era 100','Compact smart speaker with rich stereo sound.',6,10,249.00,NULL,26,'sonos-era-100','Wi-Fi, voice control, stereo','2026-04-08 01:29:54','2026-04-08 01:29:54'),(111,'Samsung Galaxy S24','Flagship smartphone with AI features.',4,1,999.00,899.00,88,'samsung-galaxy-s24','6.2-inch, 128GB, 8GB RAM','2026-04-08 01:29:54','2026-04-08 01:29:54'),(112,'Google Pixel 9','Pure Android phone with advanced camera.',4,8,899.00,829.00,62,'google-pixel-9','6.3-inch, 128GB, 8GB RAM','2026-04-08 01:29:54','2026-04-08 01:29:54'),(113,'Apple iPhone 15','Latest iPhone with upgraded camera system.',4,5,899.00,849.00,47,'apple-iphone-15','6.1-inch, 128GB, iOS','2026-04-08 01:29:54','2026-04-08 01:29:54'),(114,'Canon EOS R8','Full-frame mirrorless camera for creators.',19,34,1499.00,1399.00,47,'canon-eos-r8','24MP, 4K, RF mount','2026-04-08 01:29:54','2026-04-08 01:29:54'),(115,'Sony Alpha A7C II','Compact full-frame camera with great autofocus.',19,3,2199.00,2099.00,97,'sony-alpha-a7c-ii','33MP, 4K, IBIS','2026-04-08 01:29:54','2026-04-08 01:29:54'),(116,'Logitech MX Master 3S','Ergonomic productivity mouse.',10,35,109.00,89.00,45,'logitech-mx-master-3s','Bluetooth, USB-C, silent clicks','2026-04-08 01:29:54','2026-04-08 01:29:54'),(117,'Logitech MX Keys Mini','Compact wireless keyboard for creators.',10,35,99.00,79.00,32,'logitech-mx-keys-mini','Bluetooth, backlit, USB-C','2026-04-08 01:29:54','2026-04-08 01:29:54'),(118,'Microsoft Surface Laptop Studio 2','Versatile performance laptop with touch.',2,12,2399.00,2199.00,26,'microsoft-surface-laptop-studio-2','14.4-inch, i7, 32GB RAM, 1TB SSD','2026-04-08 01:29:54','2026-04-08 01:29:54'),(119,'Microsoft Xbox Series S','Compact next-gen gaming console.',8,12,299.00,NULL,35,'microsoft-xbox-series-s','512GB, 1440p gaming','2026-04-08 01:29:54','2026-04-08 01:29:54'),(120,'Sony PlayStation 5 Slim','Next-gen console with slim design.',8,3,499.00,NULL,98,'sony-playstation-5-slim','1TB, 4K gaming','2026-04-08 01:29:54','2026-04-08 01:29:54'),(121,'Nvidia RTX 4070 Super','High-performance GPU for gaming and creators.',9,13,699.00,649.00,87,'nvidia-rtx-4070-super','12GB GDDR6X, ray tracing','2026-04-08 01:29:54','2026-04-08 01:29:54'),(122,'AMD Radeon RX 7900 XT','Powerful GPU for high-res gaming.',9,14,899.00,829.00,39,'amd-radeon-rx-7900-xt','20GB GDDR6, 4K ready','2026-04-08 01:29:54','2026-04-08 01:29:54'),(123,'Intel Core i7-14700K','High-performance desktop CPU.',12,15,449.00,419.00,34,'intel-core-i7-14700k','20-core, up to 5.6GHz','2026-04-08 01:29:54','2026-04-08 01:29:54'),(124,'AMD Ryzen 9 7900X','Powerful CPU for creators and gaming.',12,14,499.00,459.00,54,'amd-ryzen-9-7900x','12-core, up to 5.6GHz','2026-04-08 01:29:54','2026-04-08 01:29:54'),(125,'Samsung Galaxy Watch 7','Smartwatch with health tracking.',26,1,349.00,299.00,69,'samsung-galaxy-watch-7','AMOLED, GPS, 48h battery','2026-04-08 01:29:54','2026-04-08 01:29:54'),(126,'Apple Watch Series 10','Premium smartwatch with advanced health sensors.',26,5,399.00,NULL,82,'apple-watch-series-10','Always-on display, ECG','2026-04-08 01:29:54','2026-04-08 01:29:54'),(127,'Google Nest Audio','Smart speaker for home assistance.',7,8,129.00,99.00,15,'google-nest-audio','Wi-Fi, voice control','2026-04-08 01:29:54','2026-04-08 01:29:54'),(128,'LG Soundbar S90QY','Dolby Atmos soundbar for home theater.',7,2,999.00,849.00,69,'lg-soundbar-s90qy','5.1.3ch, Dolby Atmos','2026-04-08 01:29:54','2026-04-08 01:29:54'),(129,'Sony Bravia XR X90L','4K LED TV with XR processor.',1,3,1599.00,1399.00,39,'sony-bravia-xr-x90l','65-inch 4K, HDR','2026-04-08 01:29:54','2026-04-08 01:29:54'),(130,'LG C4 OLED 55','OLED TV with perfect blacks.',1,2,1299.00,1199.00,89,'lg-c4-oled-55','55-inch OLED, 120Hz','2026-04-08 01:29:54','2026-04-08 01:29:54'),(131,'Samsung Frame TV 55','Lifestyle TV with art mode.',1,1,1499.00,1299.00,26,'samsung-frame-tv-55','55-inch QLED, Art Mode','2026-04-08 01:29:54','2026-04-08 01:29:54'),(132,'Dell OptiPlex 7010','Compact desktop for office use.',3,4,699.00,NULL,74,'dell-optiplex-7010','i5, 16GB RAM, 512GB SSD','2026-04-08 01:29:54','2026-04-08 01:29:54'),(133,'HP Omen 45L','High-end gaming desktop.',3,6,2499.00,2299.00,88,'hp-omen-45l','i9, RTX 4080, 32GB RAM','2026-04-08 01:29:54','2026-04-08 01:29:54'),(134,'Asus ROG Strix G16 Desktop','Gaming desktop with RGB and performance tuning.',3,32,1899.00,1699.00,16,'asus-rog-strix-g16-desktop','i7, RTX 4070, 16GB RAM','2026-04-08 01:29:54','2026-04-08 01:29:54'),(135,'Apple iPad Air M2','Thin tablet with M2 performance.',22,5,799.00,749.00,17,'apple-ipad-air-m2','11-inch, 128GB, Wi-Fi','2026-04-08 01:29:54','2026-04-08 01:29:54'),(136,'Samsung Galaxy Tab S9','AMOLED tablet for work and play.',22,1,899.00,799.00,38,'samsung-galaxy-tab-s9','11-inch, 128GB, S-Pen','2026-04-08 01:29:54','2026-04-08 01:29:54'),(137,'Sony Inzone H9','Wireless gaming headset with ANC.',11,3,299.00,249.00,41,'sony-inzone-h9','Gaming, ANC, 32h battery','2026-04-08 01:29:54','2026-04-08 01:29:54'),(138,'JBL Quantum 810','Gaming headset with spatial audio.',11,11,179.00,149.00,90,'jbl-quantum-810','7.1, wireless, mic','2026-04-08 01:29:54','2026-04-08 01:29:54'),(139,'Logitech G Pro X Superlight 2','Ultra-light gaming mouse.',10,35,159.00,139.00,29,'logitech-g-pro-x-superlight-2','63g, 2.4GHz, USB-C','2026-04-08 01:29:54','2026-04-08 01:29:54'),(140,'Bose Smart Soundbar 600','Compact Dolby Atmos soundbar.',7,9,499.00,449.00,75,'bose-smart-soundbar-600','Dolby Atmos, Wi-Fi','2026-04-08 01:29:54','2026-04-08 01:29:54'),(141,'Canon PowerShot V10','Compact camera for creators.',19,34,429.00,399.00,87,'canon-powershot-v10','4K, built-in stand','2026-04-08 01:29:54','2026-04-08 01:29:54'),(142,'Sony ZV-E10 II','Vlogging camera with interchangeable lens.',19,3,999.00,899.00,11,'sony-zv-e10-ii','24MP, 4K, E-mount','2026-04-08 01:29:54','2026-04-08 01:29:54'),(143,'Apple AirPods Pro 3','Premium earbuds with ANC and spatial audio.',10,5,249.00,229.00,10,'apple-airpods-pro-3','ANC, spatial audio','2026-04-08 01:29:54','2026-04-08 01:29:54'),(144,'Samsung Galaxy Buds 3 Pro','Wireless earbuds with active noise canceling.',10,1,229.00,199.00,70,'samsung-galaxy-buds-3-pro','ANC, 30h battery','2026-04-08 01:29:54','2026-04-08 01:29:54'),(145,'Dell Pro Dock WD22TB4','Thunderbolt dock for multi-display setups.',10,4,289.00,249.00,44,'dell-pro-dock-wd22tb4','Thunderbolt, 130W power','2026-04-08 01:29:54','2026-04-08 01:29:54'),(146,'HP Reverb G2 VR Headset','High-resolution VR headset for PC.',10,6,599.00,499.00,14,'hp-reverb-g2-vr-headset','2160x2160 per eye, 90Hz','2026-04-08 01:29:54','2026-04-08 01:29:54'),(147,'Asus TUF Gaming VG27AQ','Gaming monitor with high refresh rate.',24,32,329.00,299.00,35,'asus-tuf-gaming-vg27aq','27-inch QHD, 165Hz','2026-04-08 01:29:54','2026-04-08 01:29:54'),(148,'LG DualUp 28','Unique aspect ratio monitor for multitasking.',24,2,699.00,649.00,36,'lg-dualup-28','28-inch 16:18, USB-C','2026-04-08 01:29:54','2026-04-08 01:29:54'),(149,'Samsung SmartThings Hub v3','Smart home hub for connected devices.',5,1,129.00,109.00,74,'samsung-smartthings-hub-v3','Zigbee, Z-Wave, Wi-Fi','2026-04-08 01:29:54','2026-04-08 01:29:54'),(150,'Google Nest Doorbell 2','Smart video doorbell with alerts.',5,8,179.00,149.00,68,'google-nest-doorbell-2','HDR, night vision, Wi-Fi','2026-04-08 01:29:54','2026-04-08 01:29:54'),(151,'Sony HT-A5000','Soundbar with immersive audio.',7,3,999.00,899.00,14,'sony-ht-a5000','Dolby Atmos, 5.1.2ch','2026-04-08 01:29:54','2026-04-08 01:29:54'),(152,'Nvidia Shield TV Pro','Streaming device with AI upscaling.',20,13,199.00,179.00,68,'nvidia-shield-tv-pro','4K HDR, AI upscaling','2026-04-08 01:29:54','2026-04-08 01:29:54'),(153,'Amazon Fire TV 4K Max','Streaming stick with 4K support.',20,3,59.00,49.00,96,'amazon-fire-tv-4k-max','4K HDR, Wi-Fi 6','2026-04-08 01:29:54','2026-04-08 01:29:54'),(154,'Intel NUC 13 Pro','Mini PC for office and media.',12,15,699.00,649.00,80,'intel-nuc-13-pro','i7, 16GB RAM, 512GB SSD','2026-04-08 01:29:54','2026-04-08 01:29:54'),(155,'Apple Studio Display','High-end 5K display for creators.',24,5,1599.00,1499.00,10,'apple-studio-display','27-inch 5K, 600 nits','2026-04-08 01:29:54','2026-04-08 01:29:54'),(156,'JBL Bar 500','Soundbar with deep bass and Dolby Atmos.',7,11,649.00,599.00,11,'jbl-bar-500','Dolby Atmos, subwoofer','2026-04-08 01:29:54','2026-04-08 01:29:54'),(157,'Google Pixel Buds Pro 2','Premium earbuds with ANC.',10,8,229.00,199.00,24,'google-pixel-buds-pro-2','ANC, multi-point','2026-04-08 01:29:54','2026-04-08 01:29:54'),(158,'Asus ROG Ally','Handheld gaming device with Windows.',8,32,699.00,649.00,88,'asus-rog-ally','120Hz, Ryzen Z1','2026-04-08 01:29:54','2026-04-08 01:29:54'),(159,'Microsoft Surface Duo 3','Dual-screen productivity phone.',4,12,1499.00,1299.00,69,'microsoft-surface-duo-3','Dual 5.8-inch, 256GB','2026-04-08 01:29:54','2026-04-08 01:29:54'),(160,'Samsung Galaxy A55','Midrange smartphone with strong battery.',4,1,399.00,349.00,86,'samsung-galaxy-a55','6.5-inch, 128GB, 6GB RAM','2026-04-08 01:29:54','2026-04-08 01:29:54'),(161,'Sony Xperia 1 VI','Premium phone for creators.',4,3,1299.00,1199.00,20,'sony-xperia-1-vi','6.5-inch, 256GB, 12GB RAM','2026-04-08 01:29:54','2026-04-08 01:29:54'),(162,'LG WashTower Smart','Washer and dryer combo with smart controls.',5,2,1899.00,1699.00,42,'lg-washtower-smart','Smart control, 4.5 cu ft','2026-04-08 01:29:54','2026-04-08 01:29:54'),(167,'Wireless Gaming Mouse Pro','High-precision wireless gaming mouse with customizable RGB lighting and ergonomic design.',10,35,79.99,NULL,51,'wireless-gaming-mouse-pro','DPI: 16000, RGB lighting: Yes, Battery life: 70 hours, Wireless: 2.4GHz','2026-05-06 07:33:26','2026-05-06 07:33:26'),(168,'Mechanical Keyboard RGB','Mechanical keyboard with RGB backlighting, tactile switches, and programmable keys.',10,35,129.99,NULL,35,'mechanical-keyboard-rgb','Switches: Mechanical, RGB: Full, Layout: Full-size, Backlit: Yes','2026-05-06 07:33:26','2026-05-06 07:33:26'),(169,'4K Webcam Ultra HD','Ultra HD 4K webcam with autofocus, low-light correction, and built-in microphone.',19,35,149.99,NULL,20,'4k-webcam-ultra-hd','Resolution: 4K, Frame rate: 30fps, Microphone: Built-in, Auto-focus: Yes','2026-05-06 07:33:26','2026-05-06 07:33:26'),(170,'Bluetooth Earbuds Sport','Sweat-resistant Bluetooth earbuds with active noise cancellation and long battery life.',11,5,99.99,NULL,93,'bluetooth-earbuds-sport','Battery: 8 hours, Waterproof: IPX5, ANC: Yes, Charging case: Yes','2026-05-06 07:33:26','2026-05-06 07:33:26'),(171,'Smart Home Hub Voice','Voice-controlled smart home hub compatible with major assistants and IoT devices.',5,8,59.99,NULL,6,'smart-home-hub-voice','Compatibility: Alexa/Google/HomeKit, Wi-Fi: Yes, Smart home control: Yes','2026-05-06 07:33:26','2026-05-06 07:33:26'),(172,'Portable SSD 1TB','Fast portable SSD with 1TB capacity, USB-C connectivity, and shock resistance.',10,1,89.99,NULL,54,'portable-ssd-1tb','Capacity: 1TB, Interface: USB-C, Read speed: 1050MB/s, Shockproof: Yes','2026-05-06 07:33:26','2026-05-06 07:33:26'),(173,'Gaming Monitor 144Hz','144Hz gaming monitor with 1080p resolution, 1ms response time, and AMD FreeSync.',24,32,249.99,NULL,52,'gaming-monitor-144hz','Resolution: 1080p, Refresh rate: 144Hz, Response time: 1ms, Panel: IPS','2026-05-06 07:33:26','2026-05-06 07:33:26'),(174,'VR Headset Wireless','Wireless VR headset with 6DOF tracking, high-resolution display, and built-in audio.',10,6,399.99,NULL,96,'vr-headset-wireless','Resolution: 2160x2160 per eye, Refresh rate: 90Hz, Wireless: Yes, Tracking: 6DOF','2026-05-06 07:33:26','2026-05-06 07:33:26'),(175,'Drone Camera 4K','4K drone camera with GPS stabilization, 30-minute flight time, and remote control.',19,3,499.99,NULL,34,'drone-camera-4k','Resolution: 4K, Flight time: 30min, GPS: Yes, Camera: 20MP','2026-05-06 07:33:26','2026-05-06 07:33:26'),(176,'Smartwatch Fitness','Fitness-focused smartwatch with heart rate monitoring, GPS, and water resistance.',26,1,199.99,NULL,78,'smartwatch-fitness','Display: AMOLED, Battery: 7 days, GPS: Yes, Heart rate: Yes','2026-05-06 07:33:26','2026-05-06 07:33:26'),(177,'Laptop Stand Ergonomic','Adjustable ergonomic laptop stand with cooling fans and cable management.',10,4,49.99,NULL,89,'laptop-stand-ergonomic','Adjustable height: Yes, Cooling fans: Yes, Material: Aluminum','2026-05-06 07:33:26','2026-05-06 07:33:26'),(178,'Wireless Charger Fast','Fast wireless charger with 15W output, compatible with Qi-enabled devices.',10,1,29.99,NULL,8,'wireless-charger-fast','Output: 15W, Wireless: Qi, Fast charging: Yes, LED indicator: Yes','2026-05-06 07:33:26','2026-05-06 07:33:26'),(179,'External Hard Drive 2TB','2TB external hard drive with USB 3.0, portable design, and backup software.',10,4,69.99,NULL,88,'external-hard-drive-2tb','Capacity: 2TB, Interface: USB 3.0, Backup software: Included','2026-05-06 07:33:26','2026-05-06 07:33:26'),(180,'Bluetooth Speaker Waterproof','Waterproof Bluetooth speaker with 360-degree sound and 12-hour battery.',6,11,39.99,NULL,5,'bluetooth-speaker-waterproof','Battery: 12 hours, Waterproof: IPX7, Sound: 360-degree','2026-05-06 07:33:26','2026-05-06 07:33:26'),(181,'Graphics Tablet Digital','Digital graphics tablet with pressure sensitivity, stylus included, for artists.',10,35,119.99,NULL,68,'graphics-tablet-digital','Pressure levels: 2048, Size: 10x6 inches, Stylus: Included','2026-05-06 07:33:26','2026-05-06 07:33:26'),(182,'Noise Cancelling Headphones','Over-ear noise cancelling headphones with premium sound quality and comfort.',11,9,179.99,NULL,20,'noise-cancelling-headphones','ANC: Yes, Battery: 30 hours, Drivers: 40mm, Foldable: Yes','2026-05-06 07:33:26','2026-05-06 07:33:26');
/*!40000 ALTER TABLE `products` ENABLE KEYS */;

--
-- Table structure for table `reviews`
--

DROP TABLE IF EXISTS `reviews`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reviews` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `product_id` int NOT NULL,
  `rating` int NOT NULL,
  `review_text` text COLLATE utf8mb4_general_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `idx_reviews_product` (`product_id`),
  CONSTRAINT `fk_reviews_product_id` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_reviews_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_reviews_rating` CHECK (((`rating` >= 1) and (`rating` <= 5)))
) ENGINE=InnoDB AUTO_INCREMENT=112 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `reviews`
--

/*!40000 ALTER TABLE `reviews` DISABLE KEYS */;
INSERT INTO `reviews` VALUES (89,'qiUc2rVg4jRISBWD6JzxtRFMfkJ2',1,5,'This is the best product I have ever used','2026-05-29 07:07:42'),(90,'AObfEe54ppXfrushcDpgypEj1gH3',182,3,'Great quality and exactly what I needed for my setup.','2026-05-12 10:07:00'),(91,'qiUc2rVg4jRISBWD6JzxtRFMfkJ2',179,4,'Fast delivery, clean packaging, and the product works well.','2026-05-11 11:14:00'),(92,'qiUc2rVg4jRISBWD6JzxtRFMfkJ2',178,5,'Good value for the price. I would recommend it.','2026-05-10 12:21:00'),(93,'ljul8hizGLbsDwKUIjHIJYXCnFF3',176,3,'The product feels reliable and matches the description.','2026-05-09 13:28:00'),(94,'ljul8hizGLbsDwKUIjHIJYXCnFF3',175,4,'Solid performance after a few days of use.','2026-05-08 14:35:00'),(95,'ljul8hizGLbsDwKUIjHIJYXCnFF3',174,5,'Nice upgrade for my workspace. Setup was simple.','2026-05-07 15:42:00'),(96,'AObfEe54ppXfrushcDpgypEj1gH3',173,3,'Everything arrived safely and worked out of the box.','2026-05-06 16:49:00'),(97,'AObfEe54ppXfrushcDpgypEj1gH3',172,4,'The sale price made this a very good purchase.','2026-05-05 17:56:00'),(98,'AObfEe54ppXfrushcDpgypEj1gH3',171,5,'Helpful product details and no surprise at checkout.','2026-05-04 18:03:00'),(99,'AObfEe54ppXfrushcDpgypEj1gH3',170,3,'Works well, though I would like more color options.','2026-05-03 09:10:00'),(100,'qiUc2rVg4jRISBWD6JzxtRFMfkJ2',170,4,'Great quality and exactly what I needed for my setup.','2026-05-02 10:17:00'),(101,'ljul8hizGLbsDwKUIjHIJYXCnFF3',167,5,'Fast delivery, clean packaging, and the product works well.','2026-05-01 11:24:00'),(102,'ljul8hizGLbsDwKUIjHIJYXCnFF3',162,3,'Good value for the price. I would recommend it.','2026-04-30 12:31:00'),(103,'AObfEe54ppXfrushcDpgypEj1gH3',160,4,'The product feels reliable and matches the description.','2026-04-29 13:38:00'),(104,'AObfEe54ppXfrushcDpgypEj1gH3',159,5,'Solid performance after a few days of use.','2026-04-28 14:45:00'),(105,'AObfEe54ppXfrushcDpgypEj1gH3',158,3,'Nice upgrade for my workspace. Setup was simple.','2026-04-27 15:52:00'),(106,'qiUc2rVg4jRISBWD6JzxtRFMfkJ2',157,4,'Everything arrived safely and worked out of the box.','2026-04-26 16:59:00'),(107,'qiUc2rVg4jRISBWD6JzxtRFMfkJ2',156,5,'The sale price made this a very good purchase.','2026-04-25 17:06:00'),(108,'qiUc2rVg4jRISBWD6JzxtRFMfkJ2',155,3,'Helpful product details and no surprise at checkout.','2026-04-24 18:13:00'),(109,'qiUc2rVg4jRISBWD6JzxtRFMfkJ2',154,4,'Works well, though I would like more color options.','2026-04-23 09:20:00'),(110,'ljul8hizGLbsDwKUIjHIJYXCnFF3',2,5,'This is a really good product.','2026-05-25 08:13:25'),(111,'ljul8hizGLbsDwKUIjHIJYXCnFF3',131,4,'Nice product with reasonable price','2026-05-27 03:21:15');
/*!40000 ALTER TABLE `reviews` ENABLE KEYS */;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `password` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `username` varchar(16) COLLATE utf8mb4_general_ci NOT NULL,
  `first_name` text COLLATE utf8mb4_general_ci,
  `last_name` text COLLATE utf8mb4_general_ci,
  `role` varchar(16) COLLATE utf8mb4_general_ci NOT NULL,
  `token` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_login` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status` varchar(20) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'Active',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`),
  UNIQUE KEY `uq_users_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES ('AObfEe54ppXfrushcDpgypEj1gH3','test4@gmail.com','$2b$10$sPNjBdf2pTCzkEoMVtX11usZn71pcLhX1CbkYfWNpqQelRVDAq79S','customer4',NULL,NULL,'Customer','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IkFPYmZFZTU0cHBYZnJ1c2hjRHBneXBFajFnSDMiLCJlbWFpbCI6InRlc3Q0QGdtYWlsLmNvbSIsImlhdCI6MTc3MzkzNDgxMSwiZXhwIjoxNzc2NTI2ODExfQ.8_9Xwsr36nJOgyTDGaMVtzLJt-cAD5hwUK12au-0IJg','2026-03-19 15:40:11','2026-03-19 15:40:12','Active'),('ljul8hizGLbsDwKUIjHIJYXCnFF3','test1@gmail.com','$2b$10$hI67QaYzryi9sCUz7y34Suip3fMIx2rrFvQnraE6BKRR9MFc/tHsG','customer1',NULL,NULL,'Customer','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImxqdWw4aGl6R0xic0R3S1VJakhJSllYQ25GRjMiLCJlbWFpbCI6InRlc3QxQGdtYWlsLmNvbSIsInJvbGUiOiJDdXN0b21lciIsImlhdCI6MTc4MDAzNzQyMCwiZXhwIjoxNzgwMDM4MzIwfQ.JexB8PFYhKEjd7O-SCndMsk4ZN5IgaquVwvkVVsUuyc','2024-03-02 10:26:21','2026-05-29 06:50:20','Active'),('qiUc2rVg4jRISBWD6JzxtRFMfkJ2','test3@gmail.com','$2b$10$l3J3WYE9XyaPWjl/T/Sp0ekxaklJCQ.iQL1L/B8leov1GD3o2ur.6','customer3',NULL,NULL,'Customer','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InFpVWMyclZnNGpSSVNCV0Q2Snp4dFJGTWZrSjIiLCJlbWFpbCI6InRlc3QzQGdtYWlsLmNvbSIsInJvbGUiOiJDdXN0b21lciIsImlhdCI6MTc4MDA0Mzk5NCwiZXhwIjoxNzgwMDQ0ODk0fQ.O1zIGY-LlSQftUHY4XSB81cyXpxF5iFgmzD5i495HoE','2026-03-19 15:38:34','2026-05-29 08:39:54','Suspended'),('S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','test2@gmail.com','$2b$10$dVYe4JIupYWsluoE1/vES.oUeFSjTaokJ7x47Exg5ne/UzCkpzR8O','admin123',NULL,NULL,'Admin','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IlM0ZVE1Umg1MjRNeWpkSFEyRUtCWkhwam9DdjEiLCJlbWFpbCI6InRlc3QyQGdtYWlsLmNvbSIsInJvbGUiOiJBZG1pbiIsImlhdCI6MTc4MDA0ODAxOSwiZXhwIjoxNzgwMDQ4OTE5fQ.8RmG7fXXu9Lfoh51dYxjvcNPzW2yP3XKd0VjBB_J1sQ','2024-05-30 10:49:33','2026-05-29 09:46:59','Active');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;

--
-- Table structure for table `wishlist`
--

DROP TABLE IF EXISTS `wishlist`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `wishlist` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `product_id` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_wishlist_user_id_product_id` (`user_id`,`product_id`),
  KEY `FK_WishlistProduct` (`product_id`),
  KEY `idx_wishlist_user_product` (`user_id`,`product_id`),
  CONSTRAINT `fk_wishlist_product_id` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `fk_wishlist_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=282 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wishlist`
--

/*!40000 ALTER TABLE `wishlist` DISABLE KEYS */;
INSERT INTO `wishlist` VALUES (241,'ljul8hizGLbsDwKUIjHIJYXCnFF3',5),(278,'qiUc2rVg4jRISBWD6JzxtRFMfkJ2',159),(281,'qiUc2rVg4jRISBWD6JzxtRFMfkJ2',181),(252,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1',4),(255,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1',5);
/*!40000 ALTER TABLE `wishlist` ENABLE KEYS */;

--
-- Dumping routines for database 'defaultdb'
--
SET @@SESSION.SQL_LOG_BIN = @MYSQLDUMP_TEMP_LOG_BIN;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-01 14:23:43
