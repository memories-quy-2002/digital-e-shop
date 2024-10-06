-- MySQL dump 10.13  Distrib 8.0.33, for Win64 (x86_64)
--
-- Host: e-commerce-shop-digital-e-shop.e.aivencloud.com    Database: defaultdb
-- ------------------------------------------------------
-- Server version	8.0.30

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
-- Table structure for table `brands`
--

DROP TABLE IF EXISTS `brands`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `brands` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=36 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `brands`
--

/*!40000 ALTER TABLE `brands` DISABLE KEYS */;
INSERT INTO `brands` VALUES (14,'AMD'),(5,'Apple'),(32,'Asus'),(9,'Bose'),(34,'Canon'),(4,'Dell'),(8,'Google'),(6,'HP'),(15,'Intel'),(11,'JBL'),(2,'LG'),(35,'Logitech'),(12,'Microsoft'),(7,'MSI'),(13,'Nvidia'),(1,'Samsung'),(10,'Sonos'),(3,'Sony');
/*!40000 ALTER TABLE `brands` ENABLE KEYS */;

--
-- Table structure for table `cart`
--

DROP TABLE IF EXISTS `cart`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cart` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `done` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`,`user_id`) USING BTREE,
  KEY `FK_CartUser` (`user_id`),
  CONSTRAINT `FK_CartUser` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=153 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cart`
--

/*!40000 ALTER TABLE `cart` DISABLE KEYS */;
INSERT INTO `cart` VALUES (83,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2024-08-07 18:20:57',1),(85,'99rQgkUMyddb77MVZ0nEcn0BQwH2','2024-08-08 12:12:36',1),(86,'99rQgkUMyddb77MVZ0nEcn0BQwH2','2024-08-10 12:17:30',1),(87,'99rQgkUMyddb77MVZ0nEcn0BQwH2','2024-08-10 12:24:46',1),(88,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2024-08-10 12:38:15',1),(89,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2024-08-10 12:41:20',1),(90,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2024-08-10 12:43:53',1),(91,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2024-08-10 12:45:57',1),(92,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2024-08-10 12:47:03',1),(93,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2024-08-10 12:49:08',1),(94,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2024-08-10 12:49:56',1),(95,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2024-08-10 12:51:34',1),(96,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2024-08-11 09:41:21',1),(97,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2024-08-11 11:19:51',1),(98,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2024-08-25 10:51:35',1),(99,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2024-08-25 10:58:44',1),(100,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-08-25 11:29:51',1),(101,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-08-25 11:46:50',1),(102,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-04 11:15:04',1),(103,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-07 13:21:09',1),(104,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-07 16:29:15',1),(105,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2024-09-08 16:32:08',1),(106,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-09 01:12:35',1),(107,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-11 03:20:36',1),(108,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-12 04:33:18',1),(109,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-12 04:34:56',1),(110,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-12 04:50:57',1),(111,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-12 16:22:05',1),(112,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-13 11:24:35',1),(137,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-22 03:36:44',1),(138,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-22 03:38:34',1),(139,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-22 03:39:02',1),(140,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-22 03:40:42',1),(141,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-22 03:41:41',1),(142,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-22 03:42:02',1),(143,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-22 03:50:12',1),(144,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-22 03:51:18',1),(145,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-22 03:56:45',1),(146,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-22 03:58:32',1),(147,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-22 04:00:18',1),(148,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-22 04:05:36',1),(149,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-22 06:19:07',1),(150,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-24 01:44:16',1),(151,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-27 11:20:54',1),(152,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-10-04 15:22:31',1);
/*!40000 ALTER TABLE `cart` ENABLE KEYS */;

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
  UNIQUE KEY `cart_id` (`cart_id`,`product_id`),
  KEY `FK_CartItemProduct` (`product_id`),
  CONSTRAINT `FK_CartItemCart` FOREIGN KEY (`cart_id`) REFERENCES `cart` (`id`) ON DELETE CASCADE,
  CONSTRAINT `FK_CartItemProduct` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=541 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cart_items`
--

/*!40000 ALTER TABLE `cart_items` DISABLE KEYS */;
INSERT INTO `cart_items` VALUES (305,83,20,4,'2024-08-07 18:31:15'),(321,85,21,1,'2024-08-10 12:13:48'),(322,86,21,2,'2024-08-10 12:17:30'),(324,87,21,1,'2024-08-10 12:24:46'),(325,87,17,2,'2024-08-10 12:24:46'),(326,87,4,1,'2024-08-10 12:24:47'),(328,83,7,1,'2024-08-10 12:32:11'),(329,83,10,1,'2024-08-10 12:32:12'),(330,88,26,1,'2024-08-10 12:38:15'),(331,88,10,1,'2024-08-10 12:38:16'),(332,88,20,1,'2024-08-10 12:38:17'),(333,89,21,4,'2024-08-10 12:41:20'),(337,89,15,4,'2024-08-10 12:41:21'),(341,90,21,3,'2024-08-10 12:43:53'),(344,91,7,1,'2024-08-10 12:45:58'),(345,91,10,1,'2024-08-10 12:45:58'),(346,91,20,1,'2024-08-10 12:45:59'),(347,92,7,1,'2024-08-10 12:47:03'),(348,92,10,1,'2024-08-10 12:47:04'),(349,93,10,1,'2024-08-10 12:49:08'),(350,93,20,1,'2024-08-10 12:49:08'),(351,94,10,1,'2024-08-10 12:49:56'),(352,95,10,1,'2024-08-10 12:51:34'),(353,95,20,1,'2024-08-10 12:51:34'),(354,95,7,1,'2024-08-10 12:51:34'),(355,96,15,1,'2024-08-11 09:41:21'),(356,96,17,2,'2024-08-11 09:41:22'),(358,96,7,1,'2024-08-11 09:48:50'),(359,97,17,1,'2024-08-11 11:19:51'),(360,97,5,2,'2024-08-11 11:23:12'),(361,97,4,1,'2024-08-11 11:23:13'),(362,98,15,1,'2024-08-25 10:51:35'),(363,98,17,1,'2024-08-25 10:51:35'),(364,98,5,1,'2024-08-25 10:51:38'),(365,97,18,1,'2024-08-25 10:58:19'),(366,97,23,1,'2024-08-25 10:58:19'),(367,97,13,1,'2024-08-25 10:58:21'),(369,99,21,1,'2024-08-25 10:58:44'),(370,99,16,1,'2024-08-25 10:58:45'),(372,99,17,1,'2024-08-25 10:58:46'),(378,100,25,1,'2024-08-25 11:29:51'),(379,100,9,1,'2024-08-25 11:29:52'),(380,100,23,1,'2024-08-25 11:29:54'),(381,100,13,1,'2024-08-25 11:30:00'),(382,100,20,1,'2024-08-25 11:44:57'),(383,100,4,1,'2024-08-25 11:44:59'),(384,101,15,6,'2024-08-25 11:46:50'),(387,101,17,1,'2024-08-25 11:47:25'),(392,101,16,1,'2024-08-25 12:10:26'),(393,101,7,1,'2024-08-26 12:47:51'),(396,102,16,1,'2024-09-07 12:48:43'),(397,102,7,1,'2024-09-07 12:48:44'),(398,102,25,2,'2024-09-07 12:55:07'),(399,103,16,3,'2024-09-07 13:21:09'),(403,104,21,1,'2024-09-07 16:29:27'),(405,104,12,1,'2024-09-08 05:54:37'),(406,104,16,1,'2024-09-08 05:54:37'),(407,104,17,1,'2024-09-08 05:54:38'),(408,99,12,4,'2024-09-08 11:02:02'),(409,99,20,1,'2024-09-08 11:02:04'),(412,105,17,2,'2024-09-08 16:32:09'),(414,105,18,1,'2024-09-08 16:32:15'),(415,106,6,1,'2024-09-09 01:12:36'),(416,106,27,1,'2024-09-09 01:12:39'),(417,106,1,1,'2024-09-09 04:16:56'),(418,106,26,1,'2024-09-09 04:16:58'),(419,106,23,1,'2024-09-09 04:17:02'),(421,107,6,1,'2024-09-11 10:52:53'),(423,107,12,2,'2024-09-12 01:56:56'),(424,107,16,1,'2024-09-12 01:56:58'),(428,107,23,1,'2024-09-12 03:18:42'),(429,108,1,1,'2024-09-12 04:33:18'),(430,108,2,1,'2024-09-12 04:33:19'),(431,108,6,1,'2024-09-12 04:33:21'),(432,109,1,4,'2024-09-12 04:34:57'),(433,109,2,1,'2024-09-12 04:34:57'),(437,110,1,1,'2024-09-12 04:50:57'),(438,110,2,1,'2024-09-12 04:50:57'),(439,110,6,1,'2024-09-12 04:50:58'),(441,111,3,3,'2024-09-13 01:21:10'),(443,111,1,2,'2024-09-13 01:25:54'),(447,112,6,1,'2024-09-15 10:11:13'),(449,105,12,1,'2024-09-17 04:38:01'),(450,105,16,1,'2024-09-17 04:38:02'),(451,112,55,3,'2024-09-21 15:26:58'),(491,137,8,1,'2024-09-22 03:36:44'),(492,138,8,1,'2024-09-22 03:38:35'),(493,138,17,1,'2024-09-22 03:38:35'),(494,139,8,1,'2024-09-22 03:39:03'),(495,139,17,2,'2024-09-22 03:39:04'),(497,140,8,1,'2024-09-22 03:40:43'),(498,140,17,1,'2024-09-22 03:40:43'),(499,141,8,1,'2024-09-22 03:41:41'),(500,141,17,1,'2024-09-22 03:41:41'),(501,142,8,1,'2024-09-22 03:42:02'),(502,142,17,1,'2024-09-22 03:42:03'),(503,143,6,1,'2024-09-22 03:50:12'),(504,143,8,1,'2024-09-22 03:50:19'),(510,144,6,2,'2024-09-22 03:52:36'),(513,144,8,1,'2024-09-22 03:52:56'),(514,145,6,1,'2024-09-22 03:56:46'),(515,145,8,1,'2024-09-22 03:56:47'),(516,146,6,1,'2024-09-22 03:58:32'),(517,146,8,1,'2024-09-22 03:58:33'),(518,146,25,1,'2024-09-22 03:58:35'),(519,147,6,1,'2024-09-22 04:00:19'),(520,147,17,1,'2024-09-22 04:00:20'),(521,147,22,1,'2024-09-22 04:00:35'),(522,147,8,1,'2024-09-22 04:00:42'),(523,148,6,1,'2024-09-22 04:05:37'),(524,148,8,1,'2024-09-22 04:05:39'),(525,149,5,1,'2024-09-22 06:19:08'),(526,149,25,1,'2024-09-24 01:03:50'),(536,150,9,1,'2024-09-26 15:23:10'),(537,151,9,2,'2024-09-27 11:20:55'),(538,151,8,1,'2024-09-27 11:20:56'),(540,152,7,1,'2024-10-04 15:22:32');
/*!40000 ALTER TABLE `cart_items` ENABLE KEYS */;

--
-- Table structure for table `categories`
--

DROP TABLE IF EXISTS `categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `categories` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=28 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `categories`
--

/*!40000 ALTER TABLE `categories` DISABLE KEYS */;
INSERT INTO `categories` VALUES (5,'Appliance'),(20,'Application'),(19,'Camera'),(8,'Console'),(3,'Desktop'),(9,'Graphics Card'),(11,'Headphone'),(7,'Home Theater System'),(2,'Laptop'),(24,'Monitor'),(10,'Other'),(12,'PC'),(22,'Phone'),(4,'Smartphone'),(26,'Smartwatch'),(6,'Speaker'),(1,'Television');
/*!40000 ALTER TABLE `categories` ENABLE KEYS */;

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
  `session_duration` int DEFAULT NULL,
  `session_month` int DEFAULT NULL,
  `session_year` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `customer_sessions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=1165 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `customer_sessions`
--

/*!40000 ALTER TABLE `customer_sessions` DISABLE KEYS */;
INSERT INTO `customer_sessions` VALUES (122,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2024-09-03 11:05:22',NULL,NULL,9,2024),(123,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2024-09-03 11:05:40',NULL,NULL,9,2024),(124,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-03 11:19:25',NULL,NULL,9,2024),(125,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-04 09:33:02','2024-09-04 09:35:00',118,9,2024),(126,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-04 09:55:29','2024-09-04 11:30:06',5677,9,2024),(127,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2024-09-05 19:35:25',NULL,NULL,9,2024),(128,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-07 12:48:35',NULL,NULL,9,2024),(129,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2024-09-07 13:01:30',NULL,NULL,9,2024),(130,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-07 13:17:19',NULL,NULL,9,2024),(131,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-07 13:21:04','2024-09-07 13:21:16',12,9,2024),(132,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-07 16:08:24',NULL,NULL,9,2024),(133,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-07 16:52:23',NULL,NULL,9,2024),(134,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-07 16:52:35',NULL,NULL,9,2024),(135,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-07 17:04:11',NULL,NULL,9,2024),(136,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-07 17:21:38',NULL,NULL,9,2024),(137,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-08 09:42:39',NULL,NULL,9,2024),(138,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-08 05:54:07',NULL,NULL,9,2024),(139,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2024-09-08 11:01:27',NULL,NULL,9,2024),(140,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2024-09-08 16:31:17',NULL,NULL,9,2024),(141,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2024-09-09 01:08:04',NULL,NULL,9,2024),(142,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-09 01:12:13',NULL,NULL,9,2024),(143,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-09 02:11:30',NULL,NULL,9,2024),(144,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-09 02:11:35',NULL,NULL,9,2024),(145,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-09 02:23:13',NULL,NULL,9,2024),(146,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-09 02:23:59',NULL,NULL,9,2024),(147,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-09 02:24:03',NULL,NULL,9,2024),(148,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-09 02:26:02',NULL,NULL,9,2024),(149,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-09 02:30:13',NULL,NULL,9,2024),(150,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-09 02:30:59',NULL,NULL,9,2024),(151,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-09 02:31:35',NULL,NULL,9,2024),(152,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-09 02:32:56',NULL,NULL,9,2024),(153,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-09 02:33:02',NULL,NULL,9,2024),(154,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-09 02:36:09',NULL,NULL,9,2024),(155,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-09 02:38:01',NULL,NULL,9,2024),(156,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-09 02:41:26','2024-09-09 02:41:37',10,9,2024),(157,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-09 02:42:46','2024-09-09 02:42:49',2,9,2024),(158,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2024-09-09 02:42:59','2024-09-09 02:43:10',10,9,2024),(159,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2024-09-09 02:43:19',NULL,NULL,9,2024),(160,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2024-09-09 09:54:12',NULL,NULL,9,2024),(161,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2024-09-09 03:59:26','2024-09-09 04:00:20',53,9,2024),(162,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2024-09-09 04:01:28','2024-09-09 04:16:25',897,9,2024),(163,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-09 04:16:33',NULL,NULL,9,2024),(164,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-09 05:07:47','2024-09-11 03:54:28',168400,9,2024),(165,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2024-09-11 03:54:37','2024-09-11 04:00:53',376,9,2024),(166,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2024-09-11 04:01:04',NULL,NULL,9,2024),(167,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2024-09-11 04:48:48','2024-09-13 03:53:17',169468,9,2024),(168,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-11 17:40:37','2024-09-11 17:56:16',939,9,2024),(169,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2024-09-11 17:58:34','2024-09-11 19:07:29',4135,9,2024),(170,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-12 08:56:31','2024-09-12 11:54:00',10649,9,2024),(171,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2024-09-12 11:54:40',NULL,NULL,9,2024),(172,'V61VAsw0hteRnihNjQiTYSWUA6V2','2024-09-12 17:59:27','2024-09-12 18:11:10',702,9,2024),(173,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-12 18:11:43','2024-09-12 18:11:57',13,9,2024),(174,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-12 18:12:26',NULL,NULL,9,2024),(175,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-12 18:13:38','2024-09-13 08:18:21',50682,9,2024),(176,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-12 16:21:44',NULL,NULL,9,2024),(177,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-13 08:20:19','2024-09-13 08:26:17',358,9,2024),(178,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2024-09-13 08:26:42','2024-09-13 11:30:41',11039,9,2024),(179,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-13 03:53:39','2024-09-13 03:54:45',66,9,2024),(180,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2024-09-13 03:54:57','2024-09-13 04:33:15',2298,9,2024),(181,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-13 11:31:01','2024-09-13 12:07:16',2174,9,2024),(182,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-13 04:33:32',NULL,NULL,9,2024),(183,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2024-09-13 12:07:26','2024-09-14 10:18:15',79849,9,2024),(184,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2024-09-13 11:13:50','2024-09-13 11:20:42',412,9,2024),(185,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-13 11:21:22',NULL,NULL,9,2024),(186,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-13 11:24:16',NULL,NULL,9,2024),(187,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-13 11:26:20','2024-09-16 00:38:14',220313,9,2024),(188,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-14 10:18:26','2024-09-16 08:05:30',164824,9,2024),(189,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2024-09-16 00:38:26','2024-09-16 00:56:36',1089,9,2024),(190,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-16 00:59:36','2024-09-16 00:59:41',5,9,2024),(191,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2024-09-16 08:05:55','2024-09-16 08:06:07',12,9,2024),(192,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2024-09-16 08:12:06','2024-09-16 08:12:12',6,9,2024),(193,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2024-09-16 08:12:57','2024-09-16 08:13:30',32,9,2024),(194,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2024-09-16 08:13:45','2024-09-16 08:14:15',29,9,2024),(195,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2024-09-16 08:14:26','2024-09-17 11:08:50',96864,9,2024),(196,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2024-09-17 02:23:50','2024-09-17 04:33:30',7780,9,2024),(197,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-17 11:08:57','2024-09-17 11:09:02',4,9,2024),(198,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2024-09-17 11:10:36','2024-09-17 17:13:02',21746,9,2024),(199,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2024-09-17 04:37:01','2024-09-17 04:37:16',15,9,2024),(200,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2024-09-17 04:37:23','2024-09-18 03:30:09',82365,9,2024),(201,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-17 17:13:09','2024-09-17 18:04:32',3082,9,2024),(202,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2024-09-18 03:30:17','2024-09-18 11:16:50',27993,9,2024),(203,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-18 11:17:03','2024-09-21 13:52:19',268516,9,2024),(204,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-21 04:38:55',NULL,NULL,9,2024),(205,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-21 04:48:59',NULL,NULL,9,2024),(206,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-21 04:49:18','2024-09-21 15:00:03',36644,9,2024),(207,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-21 17:02:18','2024-09-21 17:08:00',342,9,2024),(208,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2024-09-21 17:08:13','2024-09-21 21:04:48',14195,9,2024),(209,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2024-09-21 17:33:23',NULL,NULL,9,2024),(210,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2024-09-21 14:02:53','2024-09-21 15:01:39',3525,9,2024),(211,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2024-09-21 21:08:33','2024-09-21 21:09:58',85,9,2024),(212,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2024-09-21 21:10:06','2024-09-21 22:34:07',5040,9,2024),(213,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-21 15:00:10',NULL,NULL,9,2024),(214,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2024-09-21 15:01:47','2024-09-21 15:29:07',1640,9,2024),(215,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-21 15:29:44','2024-09-21 15:35:02',318,9,2024),(216,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-21 22:34:16','2024-09-22 09:12:00',38264,9,2024),(217,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-21 15:35:12','2024-09-21 15:52:27',1034,9,2024),(218,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2024-09-21 15:52:41','2024-09-21 15:53:25',44,9,2024),(219,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-21 15:53:30','2024-09-22 04:05:17',43906,9,2024),(220,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-21 15:59:24',NULL,NULL,9,2024),(221,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-21 15:59:31',NULL,NULL,9,2024),(222,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-22 09:12:12','2024-09-22 10:22:40',4227,9,2024),(223,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2024-09-22 10:23:04','2024-09-22 10:23:29',24,9,2024),(224,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-22 10:23:35',NULL,NULL,9,2024),(225,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-22 04:05:26','2024-09-22 04:06:27',60,9,2024),(226,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2024-09-22 04:06:37','2024-09-22 04:11:05',267,9,2024),(227,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-22 04:11:10',NULL,NULL,9,2024),(228,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-22 06:19:02',NULL,NULL,9,2024),(229,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-24 00:57:12','2024-09-26 15:25:35',224903,9,2024),(230,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-24 08:18:38',NULL,NULL,9,2024),(231,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-24 08:20:01','2024-09-24 09:37:25',4644,9,2024),(232,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-24 09:57:23','2024-09-25 09:10:09',83565,9,2024),(233,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-24 15:05:07',NULL,NULL,9,2024),(234,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-24 15:05:10',NULL,NULL,9,2024),(235,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-24 15:05:17',NULL,NULL,9,2024),(236,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-24 16:55:15',NULL,NULL,9,2024),(237,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-24 16:55:17',NULL,NULL,9,2024),(238,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-24 16:55:38',NULL,NULL,9,2024),(239,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-24 16:55:39','2024-09-25 16:49:12',86012,9,2024),(240,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-25 09:10:19','2024-09-25 10:07:59',3459,9,2024),(241,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2024-09-25 10:08:14',NULL,NULL,9,2024),(242,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2024-09-25 16:49:33',NULL,NULL,9,2024),(243,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2024-09-26 15:25:43','2024-09-26 15:29:03',200,9,2024),(244,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-27 11:19:32','2024-09-27 11:21:09',97,9,2024),(245,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2024-09-27 11:21:29',NULL,NULL,9,2024),(246,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2024-09-27 11:21:30','2024-09-27 11:22:40',69,9,2024),(247,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-27 18:58:05',NULL,NULL,9,2024),(248,'3jrrdvJWJkhtyEk8qGIJmJJk8M92','2024-09-28 07:38:54','2024-09-28 07:47:03',488,9,2024),(249,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2024-09-28 07:47:12',NULL,NULL,9,2024);
/*!40000 ALTER TABLE `customer_sessions` ENABLE KEYS */;

--
-- Table structure for table `discount`
--

DROP TABLE IF EXISTS `discount`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `discount` (
  `discount_id` int NOT NULL AUTO_INCREMENT,
  `discount_code` varchar(50) COLLATE utf8mb4_general_ci NOT NULL,
  `description` text COLLATE utf8mb4_general_ci,
  `discount_percent` decimal(5,2) NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  PRIMARY KEY (`discount_id`),
  UNIQUE KEY `discount_code` (`discount_code`),
  CONSTRAINT `discount_chk_1` CHECK (((`discount_percent` >= 0) and (`discount_percent` <= 100)))
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `discount`
--

/*!40000 ALTER TABLE `discount` DISABLE KEYS */;
INSERT INTO `discount` VALUES (1,'SUMMER10','10% off for summer sale',10.00,'2024-07-01','2024-08-31'),(2,'HOLIDAY20','20% off for holiday season',20.00,'2024-12-01','2025-01-15'),(3,'NEWCUSTOMER15','15% off for new customers',15.00,'2024-07-01','2024-12-31');
/*!40000 ALTER TABLE `discount` ENABLE KEYS */;

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
  UNIQUE KEY `order_id` (`order_id`,`product_id`),
  KEY `FK_ProductOrderItem` (`product_id`),
  CONSTRAINT `FK_OrderOrderItem` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `FK_ProductOrderItem` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=362 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `order_items`
--

/*!40000 ALTER TABLE `order_items` DISABLE KEYS */;
INSERT INTO `order_items` VALUES (240,94,1,17,300.00),(242,94,1,23,69.00),(243,94,1,13,61.00),(244,94,2,5,1360.00),(245,95,1,16,510.00),(247,95,1,26,799.00),(255,97,2,17,600.00),(259,98,1,9,1099.99),(260,98,1,25,599.88),(261,98,1,20,799.99),(262,98,1,13,60.99),(263,98,1,23,69.25),(264,99,1,7,4000.11),(265,99,6,15,2688.00),(266,99,1,16,509.99),(267,99,1,17,300.00),(269,100,2,16,1019.98),(270,100,2,25,1199.76),(272,102,1,16,509.99),(273,102,4,12,3258.00),(274,102,1,21,149.00),(275,102,1,17,300.00),(276,102,1,20,799.99),(278,103,1,27,149.99),(279,103,1,26,799.00),(280,103,1,23,69.25),(281,103,1,6,1000.00),(282,104,1,2,3199.99),(284,104,1,6,1000.00),(285,105,3,3,9899.97),(286,105,2,1,4435.70),(342,148,1,8,799.00),(343,148,1,6,1299.00),(348,151,1,6,1299.00),(349,151,2,25,1798.00),(350,151,1,8,799.00),(351,152,1,6,1299.00),(352,152,1,22,1199.00),(353,152,1,8,799.00),(354,152,3,17,900.00),(355,153,1,6,1299.00),(356,154,1,5,679.99),(357,154,2,25,1199.76),(358,155,1,9,1099.99),(360,156,2,9,2199.98),(361,157,1,7,4000.11);
/*!40000 ALTER TABLE `order_items` ENABLE KEYS */;

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
  `total_price` decimal(11,2) NOT NULL DEFAULT '0.00',
  `discount` decimal(11,2) NOT NULL DEFAULT '0.00',
  `subtotal` decimal(11,2) NOT NULL,
  `shipping_address` text COLLATE utf8mb4_general_ci NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FK_UserOrder` (`user_id`),
  CONSTRAINT `FK_UserOrder` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=158 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `orders`
--

/*!40000 ALTER TABLE `orders` DISABLE KEYS */;
INSERT INTO `orders` VALUES (94,'2024-08-25 10:58:38','ljul8hizGLbsDwKUIjHIJYXCnFF3',2,3836.91,0.00,3836.91,''),(95,'2024-08-25 10:58:52','ljul8hizGLbsDwKUIjHIJYXCnFF3',2,1767.00,0.00,1767.00,''),(97,'2024-08-25 11:01:04','ljul8hizGLbsDwKUIjHIJYXCnFF3',1,2346.49,469.30,1877.19,''),(98,'2024-08-25 11:46:13','3jrrdvJWJkhtyEk8qGIJmJJk8M92',2,4475.92,671.39,3804.53,''),(99,'2024-09-03 11:19:48','3jrrdvJWJkhtyEk8qGIJmJJk8M92',1,9206.00,0.00,9206.00,''),(100,'2024-09-07 12:55:22','3jrrdvJWJkhtyEk8qGIJmJJk8M92',1,8535.00,0.00,8535.00,''),(101,'2024-09-07 13:21:12','3jrrdvJWJkhtyEk8qGIJmJJk8M92',2,1557.00,0.00,1557.00,''),(102,'2024-09-08 11:05:59','ljul8hizGLbsDwKUIjHIJYXCnFF3',1,5525.00,1105.00,4420.00,''),(103,'2024-09-09 04:17:11','3jrrdvJWJkhtyEk8qGIJmJJk8M92',1,4564.84,0.00,4564.84,''),(104,'2024-09-12 04:52:14','3jrrdvJWJkhtyEk8qGIJmJJk8M92',2,6716.84,0.00,6716.84,'46 HT35 Street, Hiep Thanh Ward, District 12'),(105,'2024-09-13 01:26:12','3jrrdvJWJkhtyEk8qGIJmJJk8M92',1,14935.67,0.00,14935.67,'46 HT35 Street, Hiep Thanh Ward, District 12'),(141,'2024-09-22 03:23:57','3jrrdvJWJkhtyEk8qGIJmJJk8M92',1,2997.00,0.00,2997.00,'268 Lý Thường Kiệt Street, District 10'),(148,'2024-09-22 03:50:38','3jrrdvJWJkhtyEk8qGIJmJJk8M92',1,2098.00,419.60,1678.40,'46 HT35, Hiep Thanh Ward, District 12, HCM City, Vietnam'),(151,'2024-09-22 03:58:50','3jrrdvJWJkhtyEk8qGIJmJJk8M92',1,3896.00,0.00,3896.00,'268 Lý Thường Kiệt Street, District 10'),(152,'2024-09-22 04:01:00','3jrrdvJWJkhtyEk8qGIJmJJk8M92',1,4197.00,629.55,3567.45,'268 Lý Thường Kiệt Street, District 10'),(153,'2024-09-22 04:06:00','3jrrdvJWJkhtyEk8qGIJmJJk8M92',0,2098.00,0.00,2098.00,'268 Lý Thường Kiệt Street, District 10'),(154,'2024-09-24 01:43:52','3jrrdvJWJkhtyEk8qGIJmJJk8M92',0,1879.75,0.00,1879.75,'268 Lý Thường Kiệt Street, District 10'),(155,'2024-09-26 15:25:21','3jrrdvJWJkhtyEk8qGIJmJJk8M92',0,1099.99,0.00,1099.99,'46 HT35, Hiep Thanh Ward, District 12, HCM City, Vietnam'),(156,'2024-09-28 00:46:58','3jrrdvJWJkhtyEk8qGIJmJJk8M92',0,2998.98,0.00,2998.98,'Hiep Thanh Ward, District 12, HCM City, Vietnam'),(157,'2024-10-04 15:23:09','3jrrdvJWJkhtyEk8qGIJmJJk8M92',0,4000.11,0.00,4000.11,'46 HT35, Hiep Thanh Ward, District 12, HCM City, Vietnam');
/*!40000 ALTER TABLE `orders` ENABLE KEYS */;

--
-- Table structure for table `products`
--

DROP TABLE IF EXISTS `products`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `products` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `description` varchar(255) NOT NULL DEFAULT 'No description available',
  `category_id` int NOT NULL,
  `brand_id` int NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `sale_price` decimal(10,2) DEFAULT NULL,
  `stock` int NOT NULL DEFAULT '0',
  `main_image` varchar(255) DEFAULT NULL,
  `image_gallery` text,
  `specifications` text CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `rating` decimal(2,1) NOT NULL DEFAULT '0.0',
  `reviews` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `FK_ProductCategory` (`category_id`),
  KEY `FK_ProductBrand` (`brand_id`),
  CONSTRAINT `FK_ProductBrand` FOREIGN KEY (`brand_id`) REFERENCES `brands` (`id`),
  CONSTRAINT `FK_ProductCategory` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=99 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `products`
--

/*!40000 ALTER TABLE `products` DISABLE KEYS */;
INSERT INTO `products` VALUES (1,'Samsung QN900B Neo QLED 8K Smart TV','High-end QLED 8K Smart TV with stunning picture quality',1,1,2217.85,NULL,50,'samsung_qn900b',NULL,NULL,'2024-03-02 17:57:16','2024-03-02 17:57:16',4.3,3),(2,'LG G2 OLED evo Gallery Edition TV','Gallery Edition TV with OLED 4K display',1,2,3199.99,NULL,50,'lg_g2',NULL,NULL,'2024-03-02 17:57:57','2024-03-02 17:57:57',0.0,0),(3,'Sony Bravia XR A95K OLED 4K Smart TV','',1,3,3499.99,3299.99,50,'sony_bravia_a95k',NULL,NULL,'2024-03-02 18:00:17','2024-03-02 18:00:17',5.0,1),(4,'Dell XPS 13 OLED 9320','Ultra-thin and powerful laptop with Intel Core i7 processor.',2,4,999.00,599.00,50,'dell_xps13',NULL,NULL,'2024-03-02 18:00:55','2024-03-02 18:00:55',0.0,0),(5,'HP Spectre x360 14-ef0023dx','Convertible laptop with touch screen and sleek des...',2,6,679.99,NULL,49,'hp_x360',NULL,NULL,'2024-03-02 18:05:22','2024-03-02 18:05:22',0.0,0),(6,'Apple MacBook Air M2','',2,5,1299.00,1000.00,50,'apple_macbook_air_m2',NULL,NULL,'2024-03-02 18:05:59','2024-03-02 18:05:59',4.0,1),(7,'MSI MEG Trident X Gaming Desktop','',3,7,5699.00,4000.11,50,'msi_trident_x',NULL,NULL,'2024-03-02 18:06:36','2024-03-02 18:06:36',0.0,0),(8,'iPhone 14 Pro Max','',4,5,799.00,NULL,49,'iphone_14_pro_max',NULL,NULL,'2024-03-02 18:08:23','2024-03-02 18:08:23',0.0,0),(9,'Samsung Galaxy S23 Ultra','',4,1,1099.99,NULL,47,'samsung_galaxy_s23',NULL,NULL,'2024-03-02 18:08:56','2024-03-02 18:08:56',0.0,0),(10,'Sony WH-1000XM5 Wireless Noise-Cancelling Headphones','',11,3,279.49,NULL,50,'sony_wh1000xm5',NULL,NULL,'2024-03-02 18:10:24','2024-03-02 18:10:24',2.0,1),(11,'Bose QuietComfort 45 Headphones','',11,9,279.00,NULL,50,'bose_qc45',NULL,NULL,'2024-03-02 18:10:58','2024-03-02 18:10:58',0.0,0),(12,'Sonos Arc Soundbar','',6,10,814.50,NULL,50,'sonos_arc',NULL,NULL,'2024-03-02 18:11:48','2024-03-02 18:11:48',0.0,0),(13,'JBL Flip 5 Portable Bluetooth Speaker','Portable waterproof Bluetooth speaker for outdoor use.',6,11,79.93,60.99,50,'jbl_flip5',NULL,NULL,'2024-03-02 18:12:19','2024-03-02 18:12:19',0.0,0),(15,'Microsoft Xbox Series X','',8,12,448.00,NULL,50,'microsoft_xbox',NULL,NULL,'2024-03-02 18:15:56','2024-03-02 18:15:56',4.3,4),(16,'Nvidia GeForce RTX 3080','High-end graphics card for gaming and 3D rendering...',9,13,519.00,509.99,50,'rtx_3080',NULL,NULL,'2024-03-02 18:16:46','2024-03-02 18:16:46',0.0,0),(17,'AMD Ryzen 7 Processor','High-performance processor for gaming and content creation.',3,14,300.00,NULL,47,'amd_ryzen7',NULL,NULL,'2024-05-30 18:41:07','2024-05-30 18:41:07',5.0,1),(18,'Apple iPhone 13','Latest iPhone model with advanced camera features and iOS 15.',4,5,999.00,599.99,50,'apple_iphone13',NULL,NULL,'2024-05-30 18:41:07','2024-05-30 18:41:07',0.0,0),(19,'Bose QuietComfort 35 II','Noise-canceling wireless headphones for immersive audio experience.',11,9,249.00,NULL,50,'bose_qc35',NULL,NULL,'2024-05-30 18:41:07','2024-05-30 18:41:07',0.0,0),(20,'Dell XPS 13 Laptop','Ultra-thin and powerful laptop with Intel Core i7 processor.',2,4,1299.00,799.99,50,'dell_xps13',NULL,NULL,'2024-05-30 18:41:07','2024-05-30 18:41:07',0.0,0),(21,'Google Nest Hub','Smart display with Google Assistant for home automation and entertainment.',5,8,149.00,NULL,50,'google_nest',NULL,NULL,'2024-05-30 18:41:07','2024-05-30 18:41:07',4.5,2),(22,'HP Spectre x360','Convertible laptop with touch screen and sleek design.',2,6,1199.00,NULL,49,'hp_x360',NULL,NULL,'2024-05-30 18:41:07','2024-05-30 18:41:07',0.0,0),(23,'JBL Flip 5','Portable waterproof Bluetooth speaker for outdoor use.',6,11,99.00,69.25,50,'jbl_flip5',NULL,NULL,'2024-05-30 18:41:07','2024-05-30 18:41:07',0.0,0),(25,'Microsoft Surface Pro 7','Versatile 2-in-1 tablet/laptop with Windows 10 and Surface Pen support.',2,12,899.00,599.88,48,'microsoft_surface',NULL,NULL,'2024-05-30 18:41:07','2024-05-30 18:41:07',0.0,0),(26,'MSI GeForce RTX 3080','High-end graphics card for gaming and 3D rendering.',9,7,799.00,NULL,50,'rtx_3080',NULL,NULL,'2024-05-30 18:41:07','2024-05-30 18:41:07',0.0,0),(27,'XYZ Smartwatch','Stylish smartwatch with health tracking features.',10,5,149.99,NULL,50,'xyz_smartwatch',NULL,NULL,'2024-05-30 18:44:42','2024-05-30 18:44:42',0.0,0),(28,'SoundWave Pro','True wireless earbuds with noise cancellation.',6,9,79.99,NULL,50,'soundwave_pro',NULL,NULL,'2024-05-30 18:44:42','2024-05-30 18:44:42',0.0,0),(29,'PowerUp 10000','Compact power bank for on-the-go charging.',10,1,29.99,NULL,50,'powerup_10000',NULL,NULL,'2024-05-30 18:44:42','2024-05-30 18:44:42',0.0,0),(30,'BassBoom 500','Waterproof portable speaker with deep bass.',6,9,89.99,NULL,50,'bassboom_500',NULL,NULL,'2024-05-30 18:44:42','2024-05-30 18:44:42',0.0,0),(38,'PC i5-12400F','Lorem ipsum odor amet, consectetuer adipiscing elit. Consequat dapibus velit ultrices lacinia blandit risus aptent. Senectus mus nam nec vehicula Bibendum fusce.',12,15,250.00,NULL,50,'pc_i5_12400f',NULL,'Lorem ipsum odor amet, consectetuer adipiscing elit. Consequat dapibus velit ultrices lacinia blandit risus aptent. Senectus mus nam nec vehicula Bibendum fusce.','2024-08-29 12:22:18','2024-08-29 12:22:18',0.0,0),(55,'Laptop Gaming ASUS','A powerful gaming laptop equipped with a top-of-the-line processor, high-end graphics card, and ample RAM for demanding games. Perfect for competitive gamers and enthusiasts.',2,32,2000.00,NULL,50,'laptop_gaming_asus',NULL,'','2024-09-11 12:06:04','2024-09-11 12:06:04',0.0,0),(56,'PixelMaster 8500','A full-frame DSLR camera with advanced features and exceptional image quality. Ideal for professional photographers and enthusiasts who demand the',19,34,2500.00,NULL,50,'pixelmaster_8500',NULL,'45-megapixel full-frame sensor, 5-axis image stabilization, 4K video recording, 10fps continuous shooting, weather-sealed body','2024-09-13 01:41:24','2024-09-13 01:41:24',0.0,0),(73,'SoundBlaster Pro','test good',10,35,100.00,NULL,50,'soundblaster_pro-87S9kVEZGKGbmq5gr0JiBXdNugfSJy',NULL,'','2024-09-13 10:00:32','2024-09-13 10:00:32',0.0,0),(92,'HomeControl Pro','Good',10,8,150.00,NULL,50,'homecontrol_pro-soIgOGZDgxz7uaHj42L6W09UfIGNgP',NULL,'','2024-09-13 11:03:02','2024-09-13 11:03:02',0.0,0),(93,'Samsung Galaxy S22','Samsung\'s flagship phone with a 6.1-inch AMOLED display, Exynos 2200, and triple-camera system.',22,1,999.00,NULL,50,'samsung_galaxy_s22-MbX9VZMPe4tYT7GEVo7ZXBA85sZ02x',NULL,'256GB storage, 8GB RAM, Android 12','2024-09-16 00:53:46','2024-09-16 00:53:46',0.0,0),(94,'LG 27-inch UltraFine 4K Monitor','A 27-inch 4K monitor with USB-C connectivity, ideal for creative professionals.',24,2,699.00,NULL,50,'lg_27_inch_ultrafine_4k_monitor-nvsURUy1YhJwFN8N64grGqsyUcKfqm',NULL,'4K UHD, 60Hz refresh rate, USB-C, HDR10','2024-09-16 00:55:43','2024-09-16 00:55:43',0.0,0),(95,'Apple MacBook Pro M3','The latest MacBook Pro with the Apple M3 chip, 14-inch Retina display, and powerful performance for developers and content creators.',2,5,2499.00,NULL,50,'apple_macbook_pro_m3-5ETmTGj0esYLdnZitFWzRtbtCrvenS',NULL,'M3 chip, 16GB RAM, 512GB SSD, macOS Sonoma','2024-09-16 01:18:56','2024-09-16 01:18:56',0.0,0),(97,'Google Pixel Watch 2','Google\'s new smartwatch with health tracking sensors, AMOLED display, and up to 48 hours of battery life.',26,8,399.00,NULL,50,'google_pixel_watch_2-xd42wYEix4zRQTF3tOa5y9jCrXm74u',NULL,'AMOLED, Wear OS, 48-hour battery, health sensors','2024-09-16 01:25:15','2024-09-16 01:25:15',0.0,0),(98,'iPhone 16 Pro Max','The iPhone 16 Pro Max is Apple\'s flagship smartphone, offering a powerful performance, stunning display, advanced camera system, and long-lasting battery life. It\'s designed for those who demand the best from their mobile device.',4,5,1099.00,NULL,100,'iphone_16_promax-7Fjnmr9WHE5MT9I4fUqhlslCeAHB1l',NULL,'Display: 6.9-inch Super Retina XDR OLED display with ProMotion technology (120Hz refresh rate)\r\nProcessor: Apple A18 Bionic chip   \r\nRAM: 8GB   \r\nStorage: 256GB, 512GB, or 1TB options   \r\nRear Camera: Triple camera system: 48MP main sensor, 12MP ultrawide sensor, 12MP telephoto sensor   \r\nFront Camera: 12MP TrueDepth camera with Face ID   \r\nBattery: Up to 30 hours of video playback\r\nOperating System: iOS 17\r\nDimensions: 160.7 x 77.6 x 7.8 mm\r\nWeight: Approximately 226 grams','2024-09-22 04:10:06','2024-09-22 04:10:06',0.0,0);
/*!40000 ALTER TABLE `products` ENABLE KEYS */;

--
-- Table structure for table `reviews`
--

DROP TABLE IF EXISTS `reviews`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reviews` (
  `review_id` int NOT NULL AUTO_INCREMENT,
  `user_id` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `product_id` int NOT NULL,
  `rating` int NOT NULL,
  `review_text` text COLLATE utf8mb4_general_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`review_id`),
  KEY `user_id` (`user_id`),
  KEY `product_id` (`product_id`),
  CONSTRAINT `reviews_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `reviews_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `reviews_chk_1` CHECK (((`rating` >= 1) and (`rating` <= 5)))
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `reviews`
--

/*!40000 ALTER TABLE `reviews` DISABLE KEYS */;
INSERT INTO `reviews` VALUES (1,'99rQgkUMyddb77MVZ0nEcn0BQwH2',15,4,NULL,'2024-08-10 03:30:04'),(2,'99rQgkUMyddb77MVZ0nEcn0BQwH2',15,5,'This is good product','2024-08-10 03:31:46'),(3,'99rQgkUMyddb77MVZ0nEcn0BQwH2',1,4,'Good reviews about this product','2024-08-10 04:10:58'),(4,'99rQgkUMyddb77MVZ0nEcn0BQwH2',1,5,'Good reviews about this product','2024-08-10 04:11:03'),(5,'99rQgkUMyddb77MVZ0nEcn0BQwH2',15,5,'This is a good product that I can do anything to buy it... !!!','2024-08-10 04:12:08'),(6,'ljul8hizGLbsDwKUIjHIJYXCnFF3',17,5,'I think this is good product','2024-08-11 02:41:34'),(7,'ljul8hizGLbsDwKUIjHIJYXCnFF3',1,4,'Good','2024-08-11 02:43:32'),(8,'3jrrdvJWJkhtyEk8qGIJmJJk8M92',21,5,'This is really good product for me','2024-09-04 04:12:55'),(9,'3jrrdvJWJkhtyEk8qGIJmJJk8M92',21,4,'Good','2024-09-08 02:42:58'),(10,'3jrrdvJWJkhtyEk8qGIJmJJk8M92',15,3,'This is bad product','2024-09-08 02:43:35'),(11,'ljul8hizGLbsDwKUIjHIJYXCnFF3',3,5,'Good','2024-09-08 16:32:46'),(12,'3jrrdvJWJkhtyEk8qGIJmJJk8M92',10,2,'Bad product','2024-09-13 01:25:40'),(13,'3jrrdvJWJkhtyEk8qGIJmJJk8M92',6,4,'Good and nice','2024-09-22 04:11:34');
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
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `email` (`email`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES ('3jrrdvJWJkhtyEk8qGIJmJJk8M92','test3@gmail.com','$2b$10$4qaTwuUrYvjY3N1g1Gp1AeOkPitaZcif7s.nqSaUnGGmgEBqsdDsa','customer2',NULL,NULL,'Customer','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjNqcnJkdkpXSmtodHlFazhxR0lKbUpKazhNOTIiLCJlbWFpbCI6InRlc3QzQGdtYWlsLmNvbSIsImlhdCI6MTcyODEwMzY0NSwiZXhwIjoxNzMwNjk1NjQ1fQ.Z_zO45AG4lyn3dYeJ8wrbNkwlInE7TQmp2I-tjQMPdA','2024-05-30 22:04:31','2024-10-05 04:47:44'),('99rQgkUMyddb77MVZ0nEcn0BQwH2','test5@gmail.com','$2b$10$l4hjob0EsSiGlm0a/Xy6ae2OjD8vEGvOlm97RcMVoB6F1LG8sTROy','customer2002',NULL,NULL,'Customer','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6Ijk5clFna1VNeWRkYjc3TVZaMG5FY24wQlF3SDIiLCJlbWFpbCI6InRlc3Q1QGdtYWlsLmNvbSIsImlhdCI6MTcyMzA5MjM2MiwiZXhwIjoxNzI1Njg0MzYyfQ.24oqNrB42UyLng7YRPRCulKyARYEvD__m4L7bWfcxSc','2024-08-08 11:46:02','2024-08-08 11:46:02'),('ljul8hizGLbsDwKUIjHIJYXCnFF3','test1@gmail.com','$2b$10$hI67QaYzryi9sCUz7y34Suip3fMIx2rrFvQnraE6BKRR9MFc/tHsG','customer1',NULL,NULL,'Customer','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImxqdWw4aGl6R0xic0R3S1VJakhJSllYQ25GRjMiLCJlbWFpbCI6InRlc3QxQGdtYWlsLmNvbSIsImlhdCI6MTcyNTY4ODg5MCwiZXhwIjoxNzI4MjgwODkwfQ.2onfKXTk3Q1YKhz6CNLOSl4CK5peNdn9hGL35grkO8w','2024-03-02 10:26:21','2024-09-25 16:49:33'),('S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','test2@gmail.com','$2b$10$dVYe4JIupYWsluoE1/vES.oUeFSjTaokJ7x47Exg5ne/UzCkpzR8O','admin123',NULL,NULL,'Admin','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IlM0ZVE1Umg1MjRNeWpkSFEyRUtCWkhwam9DdjEiLCJlbWFpbCI6InRlc3QyQGdtYWlsLmNvbSIsImlhdCI6MTcyODAwNDUzNCwiZXhwIjoxNzMwNTk2NTM0fQ.HLMZ-_43FQjhDVBdp5DThJHNLcKPc4XBKf-P4d8WjP4','2024-05-30 10:49:33','2024-10-04 15:23:52'),('V61VAsw0hteRnihNjQiTYSWUA6V2','test6@gmail.com','$2b$10$US9pQhgAByZmxkLeu3CsP..fW35dzf0ANt9obpcEdsjejgEfBgYnC','admin6',NULL,NULL,'Admin','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IlY2MVZBc3cwaHRlUm5paE5qUWlUWVNXVUE2VjIiLCJlbWFpbCI6InRlc3Q2QGdtYWlsLmNvbSIsImlhdCI6MTcyNjEzODE3NSwiZXhwIjoxNzI4NzMwMTc1fQ.4gBUSz5lpDwMypNczBL_6PcCb7h2fc23MnDqaF33sz8','2024-09-12 10:49:36','2024-09-12 10:59:27'),('yGbezIdeDnPB6kSlVxFKQsO4tvD3','test4@gmail.com','$2b$10$QS.HJbO/ZFmjEFfvO1D1PusEMQBwFQfDcof7xvf/ZyU5dhpdmV52C','customer3',NULL,NULL,'Customer','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InlHYmV6SWRlRG5QQjZrU2xWeEZLUXNPNHR2RDMiLCJlbWFpbCI6InRlc3Q0QGdtYWlsLmNvbSIsImlhdCI6MTcxNzA4MTU3MiwiZXhwIjoxNzE5NjczNTcyfQ.V3qT_-H6Al5j95qiaB-0dHgC49jn5uU1KS_PVC9LdkY','2024-05-30 22:06:12','2024-06-05 09:28:03');
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
  UNIQUE KEY `UC_Wishlist` (`user_id`,`product_id`),
  KEY `FK_WishlistProduct` (`product_id`),
  CONSTRAINT `FK_WishlistProduct` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `FK_WishlistUser` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=185 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wishlist`
--

/*!40000 ALTER TABLE `wishlist` DISABLE KEYS */;
INSERT INTO `wishlist` VALUES (179,'3jrrdvJWJkhtyEk8qGIJmJJk8M92',7),(184,'3jrrdvJWJkhtyEk8qGIJmJJk8M92',9),(181,'3jrrdvJWJkhtyEk8qGIJmJJk8M92',17),(136,'ljul8hizGLbsDwKUIjHIJYXCnFF3',12),(135,'ljul8hizGLbsDwKUIjHIJYXCnFF3',13),(173,'ljul8hizGLbsDwKUIjHIJYXCnFF3',16),(134,'ljul8hizGLbsDwKUIjHIJYXCnFF3',20),(163,'ljul8hizGLbsDwKUIjHIJYXCnFF3',25),(172,'ljul8hizGLbsDwKUIjHIJYXCnFF3',27);
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

-- Dump completed on 2024-10-05 18:06:27
