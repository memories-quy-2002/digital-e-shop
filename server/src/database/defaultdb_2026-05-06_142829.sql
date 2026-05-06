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

SET @@GLOBAL.GTID_PURGED=/*!80000 '+'*/ '77ef53cc-0169-11f1-9eb5-cee4b99fb32c:1-1326,
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
) ENGINE=InnoDB AUTO_INCREMENT=623 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cart_items`
--

/*!40000 ALTER TABLE `cart_items` DISABLE KEYS */;
INSERT INTO `cart_items` VALUES (618,326,161,4,'2026-05-04 04:38:08'),(621,326,153,1,'2026-05-04 04:38:23');
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
) ENGINE=InnoDB AUTO_INCREMENT=327 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `carts`
--

/*!40000 ALTER TABLE `carts` DISABLE KEYS */;
INSERT INTO `carts` VALUES (326,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-04 04:38:08',1);
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
  KEY `user_id` (`user_id`),
  CONSTRAINT `fk_customer_sessions_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=1394 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `customer_sessions`
--

/*!40000 ALTER TABLE `customer_sessions` DISABLE KEYS */;
INSERT INTO `customer_sessions` VALUES (1384,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-04 11:37:56',NULL),(1385,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-04 04:41:30',NULL),(1386,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-06 13:18:33','2026-05-06 13:25:18'),(1387,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-06 13:25:28','2026-05-06 13:36:14'),(1388,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-06 13:36:24','2026-05-06 13:45:01'),(1389,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-06 13:45:10','2026-05-06 13:45:32'),(1390,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-06 13:45:37','2026-05-06 14:21:54'),(1391,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-06 13:57:50',NULL),(1392,'ljul8hizGLbsDwKUIjHIJYXCnFF3','2026-05-06 07:17:06',NULL),(1393,'S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','2026-05-06 14:21:59',NULL);
/*!40000 ALTER TABLE `customer_sessions` ENABLE KEYS */;

--
-- Table structure for table `discounts`
--

DROP TABLE IF EXISTS `discounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `discounts` (
  `discount_id` int NOT NULL AUTO_INCREMENT,
  `discount_code` varchar(50) COLLATE utf8mb4_general_ci NOT NULL,
  `description` text COLLATE utf8mb4_general_ci,
  `discount_percent` decimal(5,2) NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  PRIMARY KEY (`discount_id`),
  UNIQUE KEY `uq_discounts_code` (`discount_code`),
  CONSTRAINT `chk_discounts_discount_percent` CHECK (((`discount_percent` > 0.00) and (`discount_percent` <= 100.00)))
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `discounts`
--

/*!40000 ALTER TABLE `discounts` DISABLE KEYS */;
INSERT INTO `discounts` VALUES (1,'SUMMER10','10% off for summer sale',10.00,'2024-07-01','2024-08-31'),(2,'HOLIDAY20','20% off for holiday season',20.00,'2024-12-01','2025-01-15'),(3,'NEWCUSTOMER15','15% off for new customers',15.00,'2024-07-01','2024-12-31');
/*!40000 ALTER TABLE `discounts` ENABLE KEYS */;

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
) ENGINE=InnoDB AUTO_INCREMENT=417 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `order_items`
--

/*!40000 ALTER TABLE `order_items` DISABLE KEYS */;
INSERT INTO `order_items` VALUES (415,186,1,153,49.00),(416,186,4,161,4796.00);
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
  `total_price` decimal(11,2) NOT NULL,
  `discount` decimal(11,2) NOT NULL DEFAULT '0.00',
  `shipping_address` text COLLATE utf8mb4_general_ci NOT NULL,
  `payment_method` varchar(32) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'cash',
  PRIMARY KEY (`id`),
  KEY `FK_UserOrder` (`user_id`),
  KEY `idx_orders_user` (`user_id`),
  CONSTRAINT `fk_orders_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `chk_orders_total_price` CHECK ((`total_price` > 0))
) ENGINE=InnoDB AUTO_INCREMENT=187 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `orders`
--

/*!40000 ALTER TABLE `orders` DISABLE KEYS */;
INSERT INTO `orders` VALUES (94,'2024-08-25 10:58:38','ljul8hizGLbsDwKUIjHIJYXCnFF3',2,3836.91,0.00,'','cash'),(95,'2024-08-25 10:58:52','ljul8hizGLbsDwKUIjHIJYXCnFF3',2,1767.00,0.00,'','cash'),(97,'2024-08-25 11:01:04','ljul8hizGLbsDwKUIjHIJYXCnFF3',1,2346.49,469.30,'','cash'),(102,'2024-09-08 11:05:59','ljul8hizGLbsDwKUIjHIJYXCnFF3',1,5525.00,1105.00,'','cash'),(160,'2025-07-31 10:41:48','ljul8hizGLbsDwKUIjHIJYXCnFF3',2,7407.98,0.00,'dasdsa','cash'),(161,'2025-08-16 15:17:03','ljul8hizGLbsDwKUIjHIJYXCnFF3',1,509.99,0.00,'46','cash'),(162,'2025-08-16 16:11:53','ljul8hizGLbsDwKUIjHIJYXCnFF3',2,749.00,0.00,'asd','cash'),(164,'2026-03-19 16:30:38','ljul8hizGLbsDwKUIjHIJYXCnFF3',2,1247.00,0.00,'sadsad','cash'),(172,'2026-03-20 01:02:43','ljul8hizGLbsDwKUIjHIJYXCnFF3',2,1000.00,0.00,'46','cash'),(176,'2026-03-20 01:07:52','ljul8hizGLbsDwKUIjHIJYXCnFF3',2,1000.00,0.00,'46','cash'),(177,'2026-03-20 01:08:39','ljul8hizGLbsDwKUIjHIJYXCnFF3',2,1000.00,0.00,'dsad','cash'),(178,'2026-03-20 01:11:52','qiUc2rVg4jRISBWD6JzxtRFMfkJ2',2,149.99,0.00,'12','cash'),(179,'2026-03-23 05:18:05','ljul8hizGLbsDwKUIjHIJYXCnFF3',1,2247.84,0.00,'dsadsadsd','cash'),(180,'2026-03-23 05:25:25','ljul8hizGLbsDwKUIjHIJYXCnFF3',1,279.00,0.00,'ewe','cash'),(181,'2026-04-08 02:32:21','ljul8hizGLbsDwKUIjHIJYXCnFF3',1,2817.85,0.00,'46 HT35 Street, Tan Thoi Hiep Ward, HCM City','cash'),(182,'2026-04-09 10:35:20','ljul8hizGLbsDwKUIjHIJYXCnFF3',1,8701.55,0.00,'Tan Thoi Hiep Ward','cash'),(183,'2026-04-10 00:45:29','ljul8hizGLbsDwKUIjHIJYXCnFF3',2,249.00,24.90,'TTH Ward','cash'),(184,'2026-04-16 01:02:54','ljul8hizGLbsDwKUIjHIJYXCnFF3',2,547.00,0.00,'Tan Thoi Hiep Ward','cash'),(185,'2026-04-16 01:40:02','ljul8hizGLbsDwKUIjHIJYXCnFF3',1,947.00,0.00,'Dsad','bank_transfer'),(186,'2026-05-06 07:21:45','ljul8hizGLbsDwKUIjHIJYXCnFF3',1,4845.00,969.00,'TTH Ward','cash');
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
  `rating` decimal(2,1) NOT NULL DEFAULT '0.0',
  `reviews` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `FK_ProductCategory` (`category_id`),
  KEY `FK_ProductBrand` (`brand_id`),
  KEY `idx_products_category_brand_rating` (`category_id`,`brand_id`,`rating`,`id`),
  KEY `idx_products_brand` (`brand_id`),
  KEY `idx_products_category` (`category_id`),
  CONSTRAINT `fk_products_brand_id_brands` FOREIGN KEY (`brand_id`) REFERENCES `brands` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_products_category_id_categories` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=167 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `products`
--

/*!40000 ALTER TABLE `products` DISABLE KEYS */;
INSERT INTO `products` VALUES (1,'Samsung QN900B Neo QLED 8K Smart TV','High-end QLED 8K Smart TV with stunning picture quality',1,1,2217.85,NULL,56,'samsung-qn900b-neo-qled-8k-smart-tv',NULL,'2024-03-02 17:57:16','2024-03-02 17:57:16',4.3,3),(2,'LG G2 OLED evo Gallery Edition TV','Gallery Edition TV with OLED 4K display',1,2,3199.99,NULL,60,'lg-g2-oled-evo-gallery-edition-tv',NULL,'2024-03-02 17:57:57','2024-03-02 17:57:57',0.0,0),(4,'Dell XPS 13 OLED 9320','Ultra-thin and powerful laptop with Intel Core i7 processor.',2,4,999.00,599.00,60,'dell-xps-13-oled-9320',NULL,'2024-03-02 18:00:55','2024-03-02 18:00:55',0.0,0),(5,'HP Spectre x360 14-ef0023dx','Convertible laptop with touch screen and sleek des...',2,6,679.99,NULL,60,'hp-spectre-x360-14-ef0023dx',NULL,'2024-03-02 18:05:22','2024-03-02 18:05:22',0.0,0),(13,'JBL Flip 5 Portable Bluetooth Speaker','Portable waterproof Bluetooth speaker for outdoor use.',6,11,79.93,60.99,60,'jbl-flip-5-portable-bluetooth-speaker',NULL,'2024-03-02 18:12:19','2024-03-02 18:12:19',0.0,0),(17,'AMD Ryzen 7 Processor','High-performance processor for gaming and content creation.',3,14,300.00,NULL,58,'amd-ryzen-7-processor',NULL,'2024-05-30 18:41:07','2024-05-30 18:41:07',5.0,1),(18,'Apple iPhone 13','Latest iPhone model with advanced camera features and iOS 15.',4,5,999.00,599.99,60,'apple-iphone-13',NULL,'2024-05-30 18:41:07','2024-05-30 18:41:07',0.0,0),(19,'Bose QuietComfort 35 II','Noise-canceling wireless headphones for immersive audio experience.',11,9,249.00,NULL,60,'bose-quietcomfort-35-ii',NULL,'2024-05-30 18:41:07','2024-05-30 18:41:07',0.0,0),(21,'Google Nest Hub','Smart display with Google Assistant for home automation and entertainment.',5,8,149.00,NULL,57,'google-nest-hub',NULL,'2024-05-30 18:41:07','2024-05-30 18:41:07',4.5,2),(25,'Microsoft Surface Pro 7','Versatile 2-in-1 tablet/laptop with Windows 10 and Surface Pen support.',2,12,899.00,599.88,60,'microsoft-surface-pro-7',NULL,'2024-05-30 18:41:07','2024-05-30 18:41:07',0.0,0),(26,'MSI GeForce RTX 3080','High-end graphics card for gaming and 3D rendering.',9,7,799.00,NULL,60,'msi-geforce-rtx-3080',NULL,'2024-05-30 18:41:07','2024-05-30 18:41:07',0.0,0),(28,'SoundWave Pro','True wireless earbuds with noise cancellation.',6,9,79.99,NULL,60,'soundwave-pro',NULL,'2024-05-30 18:44:42','2024-05-30 18:44:42',0.0,0),(29,'PowerUp 10000','Compact power bank for on-the-go charging.',10,1,29.99,NULL,60,'powerup-10000',NULL,'2024-05-30 18:44:42','2024-05-30 18:44:42',0.0,0),(30,'BassBoom 500','Waterproof portable speaker with deep bass.',6,9,89.99,NULL,60,'bassboom-500',NULL,'2024-05-30 18:44:42','2024-05-30 18:44:42',0.0,0),(38,'PC i5-12400F','Lorem ipsum odor amet, consectetuer adipiscing elit. Consequat dapibus velit ultrices lacinia blandit risus aptent. Senectus mus nam nec vehicula Bibendum fusce.',12,15,250.00,NULL,60,'pc-i5-12400f','Lorem ipsum odor amet, consectetuer adipiscing elit. Consequat dapibus velit ultrices lacinia blandit risus aptent. Senectus mus nam nec vehicula Bibendum fusce.','2024-08-29 12:22:18','2024-08-29 12:22:18',0.0,0),(56,'PixelMaster 8500','A full-frame DSLR camera with advanced features and exceptional image quality. Ideal for professional photographers and enthusiasts who demand the',19,34,2500.00,NULL,60,'pixelmaster-8500','45-megapixel full-frame sensor, 5-axis image stabilization, 4K video recording, 10fps continuous shooting, weather-sealed body','2024-09-13 01:41:24','2024-09-13 01:41:24',0.0,0),(93,'Samsung Galaxy S22','Samsung\'s flagship phone with a 6.1-inch AMOLED display, Exynos 2200, and triple-camera system.',22,1,999.00,NULL,60,'samsung-galaxy-s22','256GB storage, 8GB RAM, Android 12','2024-09-16 00:53:46','2024-09-16 00:53:46',0.0,0),(94,'LG 27-inch UltraFine 4K Monitor','A 27-inch 4K monitor with USB-C connectivity, ideal for creative professionals.',24,2,699.00,NULL,60,'lg-27-inch-ultrafine-4k-monitor','4K UHD, 60Hz refresh rate, USB-C, HDR10','2024-09-16 00:55:43','2024-09-16 00:55:43',0.0,0),(95,'Apple MacBook Pro M3','The latest MacBook Pro with the Apple M3 chip, 14-inch Retina display, and powerful performance for developers and content creators.',2,5,2499.00,NULL,60,'apple-macbook-pro-m3','M3 chip, 16GB RAM, 512GB SSD, macOS Sonoma','2024-09-16 01:18:56','2024-09-16 01:18:56',0.0,0),(97,'Google Pixel Watch 2','Google\'s new smartwatch with health tracking sensors, AMOLED display, and up to 48 hours of battery life.',26,8,399.00,NULL,60,'google-pixel-watch-2','AMOLED, Wear OS, 48-hour battery, health sensors','2024-09-16 01:25:15','2024-09-16 01:25:15',0.0,0),(99,'Dell Latitude 7450','Business laptop with strong performance and long battery life.',2,4,1299.00,1099.00,75,'dell-latitude-7450','14-inch, i7, 16GB RAM, 512GB SSD','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(100,'Asus ZenBook 14 OLED','Slim OLED laptop for creators and everyday work.',2,32,1199.00,999.00,80,'asus-zenbook-14-oled','14-inch OLED, i5, 16GB RAM, 512GB SSD','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(101,'HP Envy 16','Large-screen laptop built for productivity and media.',2,6,1399.00,NULL,70,'hp-envy-16','16-inch, i7, 16GB RAM, 1TB SSD','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(102,'Apple MacBook Air M3 15','Thin and light laptop with Apple M3 chip.',2,5,1499.00,1399.00,60,'apple-macbook-air-m3-15','15-inch, M3, 16GB RAM, 512GB SSD','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(103,'MSI Stealth 16 AI','Gaming laptop with advanced GPU and fast display.',2,7,2199.00,1999.00,55,'msi-stealth-16-ai','16-inch 240Hz, i9, RTX 4070, 32GB RAM','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(104,'Samsung Odyssey G7 27','Curved gaming monitor with high refresh rate.',24,1,699.00,599.00,90,'samsung-odyssey-g7-27','27-inch QHD, 240Hz, 1ms','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(105,'LG UltraFine 32 4K','Large 4K monitor with USB-C connectivity.',24,2,899.00,NULL,65,'lg-ultrafine-32-4k','32-inch 4K, HDR, USB-C','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(106,'Dell UltraSharp 34','Ultrawide monitor for multitasking.',24,4,999.00,899.00,55,'dell-ultrasharp-34','34-inch UWQHD, 60Hz, USB-C','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(107,'Sony WH-CH720N','Lightweight noise-cancelling headphones.',11,3,149.00,129.00,120,'sony-wh-ch720n','Bluetooth, ANC, 35h battery','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(108,'Bose QuietComfort Ultra','Premium noise cancelling headphones.',11,9,429.00,399.00,70,'bose-quietcomfort-ultra','ANC, spatial audio, 24h battery','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(109,'JBL Charge 5','Portable speaker with deep bass and long battery.',6,11,179.00,149.00,150,'jbl-charge-5','IP67, 20h battery, USB-C','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(110,'Sonos Era 100','Compact smart speaker with rich stereo sound.',6,10,249.00,NULL,90,'sonos-era-100','Wi-Fi, voice control, stereo','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(111,'Samsung Galaxy S24','Flagship smartphone with AI features.',4,1,999.00,899.00,120,'samsung-galaxy-s24','6.2-inch, 128GB, 8GB RAM','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(112,'Google Pixel 9','Pure Android phone with advanced camera.',4,8,899.00,829.00,110,'google-pixel-9','6.3-inch, 128GB, 8GB RAM','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(113,'Apple iPhone 15','Latest iPhone with upgraded camera system.',4,5,899.00,849.00,140,'apple-iphone-15','6.1-inch, 128GB, iOS','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(114,'Canon EOS R8','Full-frame mirrorless camera for creators.',19,34,1499.00,1399.00,40,'canon-eos-r8','24MP, 4K, RF mount','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(115,'Sony Alpha A7C II','Compact full-frame camera with great autofocus.',19,3,2199.00,2099.00,35,'sony-alpha-a7c-ii','33MP, 4K, IBIS','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(116,'Logitech MX Master 3S','Ergonomic productivity mouse.',10,35,109.00,89.00,200,'logitech-mx-master-3s','Bluetooth, USB-C, silent clicks','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(117,'Logitech MX Keys Mini','Compact wireless keyboard for creators.',10,35,99.00,79.00,180,'logitech-mx-keys-mini','Bluetooth, backlit, USB-C','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(118,'Microsoft Surface Laptop Studio 2','Versatile performance laptop with touch.',2,12,2399.00,2199.00,45,'microsoft-surface-laptop-studio-2','14.4-inch, i7, 32GB RAM, 1TB SSD','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(119,'Microsoft Xbox Series S','Compact next-gen gaming console.',8,12,299.00,NULL,120,'microsoft-xbox-series-s','512GB, 1440p gaming','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(120,'Sony PlayStation 5 Slim','Next-gen console with slim design.',8,3,499.00,NULL,90,'sony-playstation-5-slim','1TB, 4K gaming','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(121,'Nvidia RTX 4070 Super','High-performance GPU for gaming and creators.',9,13,699.00,649.00,70,'nvidia-rtx-4070-super','12GB GDDR6X, ray tracing','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(122,'AMD Radeon RX 7900 XT','Powerful GPU for high-res gaming.',9,14,899.00,829.00,60,'amd-radeon-rx-7900-xt','20GB GDDR6, 4K ready','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(123,'Intel Core i7-14700K','High-performance desktop CPU.',12,15,449.00,419.00,120,'intel-core-i7-14700k','20-core, up to 5.6GHz','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(124,'AMD Ryzen 9 7900X','Powerful CPU for creators and gaming.',12,14,499.00,459.00,110,'amd-ryzen-9-7900x','12-core, up to 5.6GHz','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(125,'Samsung Galaxy Watch 7','Smartwatch with health tracking.',26,1,349.00,299.00,130,'samsung-galaxy-watch-7','AMOLED, GPS, 48h battery','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(126,'Apple Watch Series 10','Premium smartwatch with advanced health sensors.',26,5,399.00,NULL,140,'apple-watch-series-10','Always-on display, ECG','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(127,'Google Nest Audio','Smart speaker for home assistance.',7,8,129.00,99.00,150,'google-nest-audio','Wi-Fi, voice control','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(128,'LG Soundbar S90QY','Dolby Atmos soundbar for home theater.',7,2,999.00,849.00,55,'lg-soundbar-s90qy','5.1.3ch, Dolby Atmos','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(129,'Sony Bravia XR X90L','4K LED TV with XR processor.',1,3,1599.00,1399.00,80,'sony-bravia-xr-x90l','65-inch 4K, HDR','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(130,'LG C4 OLED 55','OLED TV with perfect blacks.',1,2,1299.00,1199.00,90,'lg-c4-oled-55','55-inch OLED, 120Hz','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(131,'Samsung Frame TV 55','Lifestyle TV with art mode.',1,1,1499.00,1299.00,70,'samsung-frame-tv-55','55-inch QLED, Art Mode','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(132,'Dell OptiPlex 7010','Compact desktop for office use.',3,4,699.00,NULL,85,'dell-optiplex-7010','i5, 16GB RAM, 512GB SSD','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(133,'HP Omen 45L','High-end gaming desktop.',3,6,2499.00,2299.00,40,'hp-omen-45l','i9, RTX 4080, 32GB RAM','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(134,'Asus ROG Strix G16 Desktop','Gaming desktop with RGB and performance tuning.',3,32,1899.00,1699.00,45,'asus-rog-strix-g16-desktop','i7, RTX 4070, 16GB RAM','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(135,'Apple iPad Air M2','Thin tablet with M2 performance.',22,5,799.00,749.00,120,'apple-ipad-air-m2','11-inch, 128GB, Wi-Fi','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(136,'Samsung Galaxy Tab S9','AMOLED tablet for work and play.',22,1,899.00,799.00,95,'samsung-galaxy-tab-s9','11-inch, 128GB, S-Pen','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(137,'Sony Inzone H9','Wireless gaming headset with ANC.',11,3,299.00,249.00,90,'sony-inzone-h9','Gaming, ANC, 32h battery','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(138,'JBL Quantum 810','Gaming headset with spatial audio.',11,11,179.00,149.00,100,'jbl-quantum-810','7.1, wireless, mic','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(139,'Logitech G Pro X Superlight 2','Ultra-light gaming mouse.',10,35,159.00,139.00,160,'logitech-g-pro-x-superlight-2','63g, 2.4GHz, USB-C','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(140,'Bose Smart Soundbar 600','Compact Dolby Atmos soundbar.',7,9,499.00,449.00,60,'bose-smart-soundbar-600','Dolby Atmos, Wi-Fi','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(141,'Canon PowerShot V10','Compact camera for creators.',19,34,429.00,399.00,70,'canon-powershot-v10','4K, built-in stand','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(142,'Sony ZV-E10 II','Vlogging camera with interchangeable lens.',19,3,999.00,899.00,55,'sony-zv-e10-ii','24MP, 4K, E-mount','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(143,'Apple AirPods Pro 3','Premium earbuds with ANC and spatial audio.',10,5,249.00,229.00,150,'apple-airpods-pro-3','ANC, spatial audio','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(144,'Samsung Galaxy Buds 3 Pro','Wireless earbuds with active noise canceling.',10,1,229.00,199.00,150,'samsung-galaxy-buds-3-pro','ANC, 30h battery','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(145,'Dell Pro Dock WD22TB4','Thunderbolt dock for multi-display setups.',10,4,289.00,249.00,140,'dell-pro-dock-wd22tb4','Thunderbolt, 130W power','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(146,'HP Reverb G2 VR Headset','High-resolution VR headset for PC.',10,6,599.00,499.00,45,'hp-reverb-g2-vr-headset','2160x2160 per eye, 90Hz','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(147,'Asus TUF Gaming VG27AQ','Gaming monitor with high refresh rate.',24,32,329.00,299.00,100,'asus-tuf-gaming-vg27aq','27-inch QHD, 165Hz','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(148,'LG DualUp 28','Unique aspect ratio monitor for multitasking.',24,2,699.00,649.00,60,'lg-dualup-28','28-inch 16:18, USB-C','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(149,'Samsung SmartThings Hub v3','Smart home hub for connected devices.',5,1,129.00,109.00,140,'samsung-smartthings-hub-v3','Zigbee, Z-Wave, Wi-Fi','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(150,'Google Nest Doorbell 2','Smart video doorbell with alerts.',5,8,179.00,149.00,130,'google-nest-doorbell-2','HDR, night vision, Wi-Fi','2026-04-08 01:29:54','2026-04-08 01:29:54',5.0,84),(151,'Sony HT-A5000','Soundbar with immersive audio.',7,3,999.00,899.00,55,'sony-ht-a5000','Dolby Atmos, 5.1.2ch','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(152,'Nvidia Shield TV Pro','Streaming device with AI upscaling.',20,13,199.00,179.00,120,'nvidia-shield-tv-pro','4K HDR, AI upscaling','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(153,'Amazon Fire TV 4K Max','Streaming stick with 4K support.',20,3,59.00,49.00,198,'amazon-fire-tv-4k-max','4K HDR, Wi-Fi 6','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(154,'Intel NUC 13 Pro','Mini PC for office and media.',12,15,699.00,649.00,80,'intel-nuc-13-pro','i7, 16GB RAM, 512GB SSD','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(155,'Apple Studio Display','High-end 5K display for creators.',24,5,1599.00,1499.00,35,'apple-studio-display','27-inch 5K, 600 nits','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(156,'JBL Bar 500','Soundbar with deep bass and Dolby Atmos.',7,11,649.00,599.00,69,'jbl-bar-500','Dolby Atmos, subwoofer','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(157,'Google Pixel Buds Pro 2','Premium earbuds with ANC.',10,8,229.00,199.00,119,'google-pixel-buds-pro-2','ANC, multi-point','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(158,'Asus ROG Ally','Handheld gaming device with Windows.',8,32,699.00,649.00,65,'asus-rog-ally','120Hz, Ryzen Z1','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(159,'Microsoft Surface Duo 3','Dual-screen productivity phone.',4,12,1499.00,1299.00,40,'microsoft-surface-duo-3','Dual 5.8-inch, 256GB','2026-04-08 01:29:54','2026-04-08 01:29:54',0.0,0),(160,'Samsung Galaxy A55','Midrange smartphone with strong battery.',4,1,399.00,349.00,138,'samsung-galaxy-a55','6.5-inch, 128GB, 6GB RAM','2026-04-08 01:29:54','2026-04-08 01:29:54',4.0,85),(161,'Sony Xperia 1 VI','Premium phone for creators.',4,3,1299.00,1199.00,56,'sony-xperia-1-vi','6.5-inch, 256GB, 12GB RAM','2026-04-08 01:29:54','2026-04-08 01:29:54',4.0,87),(162,'LG WashTower Smart','Washer and dryer combo with smart controls.',5,2,1899.00,1699.00,24,'lg-washtower-smart','Smart control, 4.5 cu ft','2026-04-08 01:29:54','2026-04-08 01:29:54',5.0,86);
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
  KEY `idx_reviews_product` (`product_id`),
  CONSTRAINT `fk_reviews_product_id` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_reviews_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_reviews_rating` CHECK (((`rating` >= 1) and (`rating` <= 5)))
) ENGINE=InnoDB AUTO_INCREMENT=88 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `reviews`
--

/*!40000 ALTER TABLE `reviews` DISABLE KEYS */;
INSERT INTO `reviews` VALUES (86,'ljul8hizGLbsDwKUIjHIJYXCnFF3',162,5,'This is a good product','2026-05-06 06:27:55'),(87,'ljul8hizGLbsDwKUIjHIJYXCnFF3',161,4,'Good','2026-05-06 06:28:13');
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
  UNIQUE KEY `uq_users_email` (`email`),
  UNIQUE KEY `uq_users_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES ('AObfEe54ppXfrushcDpgypEj1gH3','test4@gmail.com','$2b$10$sPNjBdf2pTCzkEoMVtX11usZn71pcLhX1CbkYfWNpqQelRVDAq79S','customer4',NULL,NULL,'Customer','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IkFPYmZFZTU0cHBYZnJ1c2hjRHBneXBFajFnSDMiLCJlbWFpbCI6InRlc3Q0QGdtYWlsLmNvbSIsImlhdCI6MTc3MzkzNDgxMSwiZXhwIjoxNzc2NTI2ODExfQ.8_9Xwsr36nJOgyTDGaMVtzLJt-cAD5hwUK12au-0IJg','2026-03-19 15:40:11','2026-03-19 15:40:12'),('ljul8hizGLbsDwKUIjHIJYXCnFF3','test1@gmail.com','$2b$10$hI67QaYzryi9sCUz7y34Suip3fMIx2rrFvQnraE6BKRR9MFc/tHsG','customer1',NULL,NULL,'Customer','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImxqdWw4aGl6R0xic0R3S1VJakhJSllYQ25GRjMiLCJlbWFpbCI6InRlc3QxQGdtYWlsLmNvbSIsInJvbGUiOiJDdXN0b21lciIsImlhdCI6MTc3ODA1MTgyNiwiZXhwIjoxNzgwNjQzODI2fQ.uSpUC8AtbcykOhA1sbNw_gjNpUsA3Ez6RuhS50y4b50','2024-03-02 10:26:21','2026-05-06 07:17:06'),('qiUc2rVg4jRISBWD6JzxtRFMfkJ2','test3@gmail.com','$2b$10$l3J3WYE9XyaPWjl/T/Sp0ekxaklJCQ.iQL1L/B8leov1GD3o2ur.6','customer3',NULL,NULL,'Customer','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InFpVWMyclZnNGpSSVNCV0Q2Snp4dFJGTWZrSjIiLCJlbWFpbCI6InRlc3QzQGdtYWlsLmNvbSIsInJvbGUiOiJDdXN0b21lciIsImlhdCI6MTc3Mzk2OTA2MiwiZXhwIjoxNzczOTY5OTYyfQ.niF35cccc2fr7ZKkLzPRirTCvz3epq5QQffxhBLanBI','2026-03-19 15:38:34','2026-03-20 01:11:02'),('S4eQ5Rh524MyjdHQ2EKBZHpjoCv1','test2@gmail.com','$2b$10$dVYe4JIupYWsluoE1/vES.oUeFSjTaokJ7x47Exg5ne/UzCkpzR8O','admin123',NULL,NULL,'Admin','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IlM0ZVE1Umg1MjRNeWpkSFEyRUtCWkhwam9DdjEiLCJlbWFpbCI6InRlc3QyQGdtYWlsLmNvbSIsInJvbGUiOiJBZG1pbiIsImlhdCI6MTc3ODA1MjExOSwiZXhwIjoxNzc4MDUzMDE5fQ.yY_vr4cnwGUjdG3LNv-p2MG6cJCH1xOWvrXFwTZJlvQ','2024-05-30 10:49:33','2026-05-06 07:21:59');
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
) ENGINE=InnoDB AUTO_INCREMENT=235 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wishlist`
--

/*!40000 ALTER TABLE `wishlist` DISABLE KEYS */;
INSERT INTO `wishlist` VALUES (234,'ljul8hizGLbsDwKUIjHIJYXCnFF3',149),(233,'ljul8hizGLbsDwKUIjHIJYXCnFF3',150),(232,'ljul8hizGLbsDwKUIjHIJYXCnFF3',157),(231,'ljul8hizGLbsDwKUIjHIJYXCnFF3',162);
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

-- Dump completed on 2026-05-06 14:29:02
