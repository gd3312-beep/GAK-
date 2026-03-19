-- MySQL dump 10.13  Distrib 9.4.0, for macos15.4 (arm64)
--
-- Host: localhost    Database: GAK
-- ------------------------------------------------------
-- Server version	9.4.0

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

--
-- Table structure for table `academic_calendar`
--

DROP TABLE IF EXISTS `academic_calendar`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `academic_calendar` (
  `calendar_id` varchar(255) NOT NULL,
  `academic_year` int DEFAULT NULL,
  `date` date DEFAULT NULL,
  `day_order` int DEFAULT NULL,
  `event_type` varchar(255) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `academic_unit_id` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`calendar_id`),
  KEY `academic_unit_id` (`academic_unit_id`),
  CONSTRAINT `academic_calendar_ibfk_1` FOREIGN KEY (`academic_unit_id`) REFERENCES `academic_unit` (`academic_unit_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `academic_calendar`
--

LOCK TABLES `academic_calendar` WRITE;
/*!40000 ALTER TABLE `academic_calendar` DISABLE KEYS */;
/*!40000 ALTER TABLE `academic_calendar` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `academic_goal`
--

DROP TABLE IF EXISTS `academic_goal`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `academic_goal` (
  `goal_id` varchar(255) NOT NULL,
  `user_id` varchar(255) DEFAULT NULL,
  `subject_id` varchar(255) DEFAULT NULL,
  `goal_type` varchar(255) DEFAULT NULL,
  `target_value` float DEFAULT NULL,
  `deadline_date` date DEFAULT NULL,
  `status` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`goal_id`),
  KEY `user_id` (`user_id`),
  KEY `subject_id` (`subject_id`),
  CONSTRAINT `academic_goal_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `app_user` (`user_id`),
  CONSTRAINT `academic_goal_ibfk_2` FOREIGN KEY (`subject_id`) REFERENCES `subject` (`subject_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `academic_goal`
--

LOCK TABLES `academic_goal` WRITE;
/*!40000 ALTER TABLE `academic_goal` DISABLE KEYS */;
/*!40000 ALTER TABLE `academic_goal` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `academic_profile`
--

DROP TABLE IF EXISTS `academic_profile`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `academic_profile` (
  `academic_profile_id` varchar(255) NOT NULL,
  `user_id` varchar(255) DEFAULT NULL,
  `university_id` varchar(255) DEFAULT NULL,
  `campus_id` varchar(255) DEFAULT NULL,
  `academic_unit_id` varchar(255) DEFAULT NULL,
  `section_id` varchar(255) DEFAULT NULL,
  `program` varchar(255) DEFAULT NULL,
  `branch` varchar(255) DEFAULT NULL,
  `admission_year` int DEFAULT NULL,
  `current_semester` int DEFAULT NULL,
  PRIMARY KEY (`academic_profile_id`),
  KEY `user_id` (`user_id`),
  KEY `university_id` (`university_id`),
  KEY `campus_id` (`campus_id`),
  KEY `academic_unit_id` (`academic_unit_id`),
  KEY `section_id` (`section_id`),
  CONSTRAINT `academic_profile_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `app_user` (`user_id`),
  CONSTRAINT `academic_profile_ibfk_2` FOREIGN KEY (`university_id`) REFERENCES `university` (`university_id`),
  CONSTRAINT `academic_profile_ibfk_3` FOREIGN KEY (`campus_id`) REFERENCES `campus` (`campus_id`),
  CONSTRAINT `academic_profile_ibfk_4` FOREIGN KEY (`academic_unit_id`) REFERENCES `academic_unit` (`academic_unit_id`),
  CONSTRAINT `academic_profile_ibfk_5` FOREIGN KEY (`section_id`) REFERENCES `section` (`section_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `academic_profile`
--

LOCK TABLES `academic_profile` WRITE;
/*!40000 ALTER TABLE `academic_profile` DISABLE KEYS */;
/*!40000 ALTER TABLE `academic_profile` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `academic_unit`
--

DROP TABLE IF EXISTS `academic_unit`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `academic_unit` (
  `academic_unit_id` varchar(255) NOT NULL,
  `unit_name` varchar(255) DEFAULT NULL,
  `unit_type` varchar(255) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `campus_id` varchar(255) DEFAULT NULL,
  `university_id` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`academic_unit_id`),
  KEY `campus_id` (`campus_id`),
  KEY `university_id` (`university_id`),
  CONSTRAINT `academic_unit_ibfk_1` FOREIGN KEY (`campus_id`) REFERENCES `campus` (`campus_id`),
  CONSTRAINT `academic_unit_ibfk_2` FOREIGN KEY (`university_id`) REFERENCES `university` (`university_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `academic_unit`
--

LOCK TABLES `academic_unit` WRITE;
/*!40000 ALTER TABLE `academic_unit` DISABLE KEYS */;
/*!40000 ALTER TABLE `academic_unit` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `activity_log`
--

DROP TABLE IF EXISTS `activity_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `activity_log` (
  `activity_id` varchar(255) NOT NULL,
  `user_id` varchar(255) DEFAULT NULL,
  `activity_type` varchar(255) DEFAULT NULL,
  `calories_burned` float DEFAULT NULL,
  `duration` int DEFAULT NULL,
  `start_time` timestamp NULL DEFAULT NULL,
  `end_time` timestamp NULL DEFAULT NULL,
  `source` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`activity_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `activity_log_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `app_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `activity_log`
--

LOCK TABLES `activity_log` WRITE;
/*!40000 ALTER TABLE `activity_log` DISABLE KEYS */;
/*!40000 ALTER TABLE `activity_log` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `app_user`
--

DROP TABLE IF EXISTS `app_user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `app_user` (
  `user_id` varchar(255) NOT NULL,
  `full_name` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `password_hash` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `app_user`
--

LOCK TABLES `app_user` WRITE;
/*!40000 ALTER TABLE `app_user` DISABLE KEYS */;
/*!40000 ALTER TABLE `app_user` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `attendance_record`
--

DROP TABLE IF EXISTS `attendance_record`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `attendance_record` (
  `attendance_id` varchar(255) NOT NULL,
  `user_id` varchar(255) DEFAULT NULL,
  `subject_id` varchar(255) DEFAULT NULL,
  `timetable_entry_id` varchar(255) DEFAULT NULL,
  `class_date` date DEFAULT NULL,
  `attended` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`attendance_id`),
  KEY `user_id` (`user_id`),
  KEY `subject_id` (`subject_id`),
  KEY `timetable_entry_id` (`timetable_entry_id`),
  CONSTRAINT `attendance_record_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `app_user` (`user_id`),
  CONSTRAINT `attendance_record_ibfk_2` FOREIGN KEY (`subject_id`) REFERENCES `subject` (`subject_id`),
  CONSTRAINT `attendance_record_ibfk_3` FOREIGN KEY (`timetable_entry_id`) REFERENCES `timetable_entry` (`timetable_entry_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `attendance_record`
--

LOCK TABLES `attendance_record` WRITE;
/*!40000 ALTER TABLE `attendance_record` DISABLE KEYS */;
/*!40000 ALTER TABLE `attendance_record` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `body_metric`
--

DROP TABLE IF EXISTS `body_metric`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `body_metric` (
  `metric_id` varchar(255) NOT NULL,
  `user_id` varchar(255) DEFAULT NULL,
  `height` float DEFAULT NULL,
  `weight` float DEFAULT NULL,
  `body_fat_percentage` float DEFAULT NULL,
  `recorded_timestamp` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`metric_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `body_metric_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `app_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `body_metric`
--

LOCK TABLES `body_metric` WRITE;
/*!40000 ALTER TABLE `body_metric` DISABLE KEYS */;
/*!40000 ALTER TABLE `body_metric` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `calendar_event`
--

DROP TABLE IF EXISTS `calendar_event`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `calendar_event` (
  `event_id` varchar(255) NOT NULL,
  `user_id` varchar(255) DEFAULT NULL,
  `event_date` date DEFAULT NULL,
  `event_type` varchar(255) DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`event_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `calendar_event_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `app_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `calendar_event`
--

LOCK TABLES `calendar_event` WRITE;
/*!40000 ALTER TABLE `calendar_event` DISABLE KEYS */;
/*!40000 ALTER TABLE `calendar_event` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `campus`
--

DROP TABLE IF EXISTS `campus`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `campus` (
  `campus_id` varchar(255) NOT NULL,
  `campus_name` varchar(255) DEFAULT NULL,
  `university_id` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`campus_id`),
  KEY `university_id` (`university_id`),
  CONSTRAINT `campus_ibfk_1` FOREIGN KEY (`university_id`) REFERENCES `university` (`university_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `campus`
--

LOCK TABLES `campus` WRITE;
/*!40000 ALTER TABLE `campus` DISABLE KEYS */;
/*!40000 ALTER TABLE `campus` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `classroom`
--

DROP TABLE IF EXISTS `classroom`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `classroom` (
  `classroom_id` varchar(255) NOT NULL,
  `room_number` varchar(255) DEFAULT NULL,
  `building_name` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`classroom_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `classroom`
--

LOCK TABLES `classroom` WRITE;
/*!40000 ALTER TABLE `classroom` DISABLE KEYS */;
/*!40000 ALTER TABLE `classroom` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `confirmed_food_item`
--

DROP TABLE IF EXISTS `confirmed_food_item`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `confirmed_food_item` (
  `confirmed_id` varchar(255) NOT NULL,
  `detected_id` varchar(255) DEFAULT NULL,
  `quantity` float DEFAULT NULL,
  `calories` float DEFAULT NULL,
  `protein` float DEFAULT NULL,
  `carbs` float DEFAULT NULL,
  `fats` float DEFAULT NULL,
  PRIMARY KEY (`confirmed_id`),
  KEY `detected_id` (`detected_id`),
  CONSTRAINT `confirmed_food_item_ibfk_1` FOREIGN KEY (`detected_id`) REFERENCES `detected_food_item` (`detected_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `confirmed_food_item`
--

LOCK TABLES `confirmed_food_item` WRITE;
/*!40000 ALTER TABLE `confirmed_food_item` DISABLE KEYS */;
/*!40000 ALTER TABLE `confirmed_food_item` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `detected_food_item`
--

DROP TABLE IF EXISTS `detected_food_item`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `detected_food_item` (
  `detected_id` varchar(255) NOT NULL,
  `image_id` varchar(255) DEFAULT NULL,
  `food_name` varchar(255) DEFAULT NULL,
  `confidence_score` float DEFAULT NULL,
  PRIMARY KEY (`detected_id`),
  KEY `image_id` (`image_id`),
  CONSTRAINT `detected_food_item_ibfk_1` FOREIGN KEY (`image_id`) REFERENCES `food_image` (`image_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `detected_food_item`
--

LOCK TABLES `detected_food_item` WRITE;
/*!40000 ALTER TABLE `detected_food_item` DISABLE KEYS */;
/*!40000 ALTER TABLE `detected_food_item` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `faculty`
--

DROP TABLE IF EXISTS `faculty`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `faculty` (
  `faculty_id` varchar(255) NOT NULL,
  `faculty_name` varchar(255) DEFAULT NULL,
  `department` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`faculty_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `faculty`
--

LOCK TABLES `faculty` WRITE;
/*!40000 ALTER TABLE `faculty` DISABLE KEYS */;
/*!40000 ALTER TABLE `faculty` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `food_image`
--

DROP TABLE IF EXISTS `food_image`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `food_image` (
  `image_id` varchar(255) NOT NULL,
  `user_id` varchar(255) DEFAULT NULL,
  `image_url` varchar(255) DEFAULT NULL,
  `uploaded_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`image_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `food_image_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `app_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `food_image`
--

LOCK TABLES `food_image` WRITE;
/*!40000 ALTER TABLE `food_image` DISABLE KEYS */;
/*!40000 ALTER TABLE `food_image` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `food_log`
--

DROP TABLE IF EXISTS `food_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `food_log` (
  `food_log_id` varchar(255) NOT NULL,
  `user_id` varchar(255) DEFAULT NULL,
  `log_date` date DEFAULT NULL,
  `total_calories` float DEFAULT NULL,
  PRIMARY KEY (`food_log_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `food_log_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `app_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `food_log`
--

LOCK TABLES `food_log` WRITE;
/*!40000 ALTER TABLE `food_log` DISABLE KEYS */;
/*!40000 ALTER TABLE `food_log` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `integration_status`
--

DROP TABLE IF EXISTS `integration_status`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `integration_status` (
  `integration_id` varchar(255) NOT NULL,
  `user_id` varchar(255) DEFAULT NULL,
  `integration_type` varchar(255) DEFAULT NULL,
  `status` varchar(255) DEFAULT NULL,
  `last_synced_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`integration_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `integration_status_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `app_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `integration_status`
--

LOCK TABLES `integration_status` WRITE;
/*!40000 ALTER TABLE `integration_status` DISABLE KEYS */;
/*!40000 ALTER TABLE `integration_status` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `marks_record`
--

DROP TABLE IF EXISTS `marks_record`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `marks_record` (
  `marks_id` varchar(255) NOT NULL,
  `user_id` varchar(255) DEFAULT NULL,
  `subject_id` varchar(255) DEFAULT NULL,
  `component_type` varchar(255) DEFAULT NULL,
  `score` float DEFAULT NULL,
  `max_score` float DEFAULT NULL,
  `recorded_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`marks_id`),
  KEY `user_id` (`user_id`),
  KEY `subject_id` (`subject_id`),
  CONSTRAINT `marks_record_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `app_user` (`user_id`),
  CONSTRAINT `marks_record_ibfk_2` FOREIGN KEY (`subject_id`) REFERENCES `subject` (`subject_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `marks_record`
--

LOCK TABLES `marks_record` WRITE;
/*!40000 ALTER TABLE `marks_record` DISABLE KEYS */;
/*!40000 ALTER TABLE `marks_record` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `section`
--

DROP TABLE IF EXISTS `section`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `section` (
  `section_id` varchar(255) NOT NULL,
  `section_name` varchar(255) DEFAULT NULL,
  `academic_year` int DEFAULT NULL,
  `semester` int DEFAULT NULL,
  `program` varchar(255) DEFAULT NULL,
  `academic_unit_id` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`section_id`),
  KEY `academic_unit_id` (`academic_unit_id`),
  CONSTRAINT `section_ibfk_1` FOREIGN KEY (`academic_unit_id`) REFERENCES `academic_unit` (`academic_unit_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `section`
--

LOCK TABLES `section` WRITE;
/*!40000 ALTER TABLE `section` DISABLE KEYS */;
/*!40000 ALTER TABLE `section` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `subject`
--

DROP TABLE IF EXISTS `subject`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `subject` (
  `subject_id` varchar(255) NOT NULL,
  `subject_name` varchar(255) DEFAULT NULL,
  `credits` int DEFAULT NULL,
  `minimum_attendance_percentage` float DEFAULT NULL,
  `academic_unit_id` varchar(255) DEFAULT NULL,
  `program` varchar(255) DEFAULT NULL,
  `semester` int DEFAULT NULL,
  PRIMARY KEY (`subject_id`),
  KEY `academic_unit_id` (`academic_unit_id`),
  CONSTRAINT `subject_ibfk_1` FOREIGN KEY (`academic_unit_id`) REFERENCES `academic_unit` (`academic_unit_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `subject`
--

LOCK TABLES `subject` WRITE;
/*!40000 ALTER TABLE `subject` DISABLE KEYS */;
/*!40000 ALTER TABLE `subject` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `timetable_entry`
--

DROP TABLE IF EXISTS `timetable_entry`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `timetable_entry` (
  `timetable_entry_id` varchar(255) NOT NULL,
  `unified_timetable_id` varchar(255) DEFAULT NULL,
  `section_id` varchar(255) DEFAULT NULL,
  `subject_id` varchar(255) DEFAULT NULL,
  `faculty_id` varchar(255) DEFAULT NULL,
  `classroom_id` varchar(255) DEFAULT NULL,
  `day_order` int DEFAULT NULL,
  `start_time` time DEFAULT NULL,
  `end_time` time DEFAULT NULL,
  PRIMARY KEY (`timetable_entry_id`),
  KEY `unified_timetable_id` (`unified_timetable_id`),
  KEY `faculty_id` (`faculty_id`),
  KEY `classroom_id` (`classroom_id`),
  CONSTRAINT `timetable_entry_ibfk_1` FOREIGN KEY (`unified_timetable_id`) REFERENCES `unified_timetable` (`unified_timetable_id`),
  CONSTRAINT `timetable_entry_ibfk_2` FOREIGN KEY (`faculty_id`) REFERENCES `faculty` (`faculty_id`),
  CONSTRAINT `timetable_entry_ibfk_3` FOREIGN KEY (`classroom_id`) REFERENCES `classroom` (`classroom_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `timetable_entry`
--

LOCK TABLES `timetable_entry` WRITE;
/*!40000 ALTER TABLE `timetable_entry` DISABLE KEYS */;
/*!40000 ALTER TABLE `timetable_entry` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `unified_timetable`
--

DROP TABLE IF EXISTS `unified_timetable`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `unified_timetable` (
  `unified_timetable_id` varchar(255) NOT NULL,
  `academic_year` int DEFAULT NULL,
  `semester` int DEFAULT NULL,
  `batch` varchar(255) DEFAULT NULL,
  `academic_unit_id` varchar(255) DEFAULT NULL,
  `campus_id` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`unified_timetable_id`),
  KEY `academic_unit_id` (`academic_unit_id`),
  KEY `campus_id` (`campus_id`),
  CONSTRAINT `unified_timetable_ibfk_1` FOREIGN KEY (`academic_unit_id`) REFERENCES `academic_unit` (`academic_unit_id`),
  CONSTRAINT `unified_timetable_ibfk_2` FOREIGN KEY (`campus_id`) REFERENCES `campus` (`campus_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `unified_timetable`
--

LOCK TABLES `unified_timetable` WRITE;
/*!40000 ALTER TABLE `unified_timetable` DISABLE KEYS */;
/*!40000 ALTER TABLE `unified_timetable` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `university`
--

DROP TABLE IF EXISTS `university`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `university` (
  `university_id` varchar(255) NOT NULL,
  `university_name` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`university_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `university`
--

LOCK TABLES `university` WRITE;
/*!40000 ALTER TABLE `university` DISABLE KEYS */;
/*!40000 ALTER TABLE `university` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `workout_action`
--

DROP TABLE IF EXISTS `workout_action`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `workout_action` (
  `action_id` varchar(255) NOT NULL,
  `session_id` varchar(255) DEFAULT NULL,
  `user_id` varchar(255) DEFAULT NULL,
  `status` varchar(255) DEFAULT NULL,
  `performed_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`action_id`),
  KEY `session_id` (`session_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `workout_action_ibfk_1` FOREIGN KEY (`session_id`) REFERENCES `workout_session` (`session_id`),
  CONSTRAINT `workout_action_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `app_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `workout_action`
--

LOCK TABLES `workout_action` WRITE;
/*!40000 ALTER TABLE `workout_action` DISABLE KEYS */;
/*!40000 ALTER TABLE `workout_action` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `workout_plan`
--

DROP TABLE IF EXISTS `workout_plan`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `workout_plan` (
  `plan_id` varchar(255) NOT NULL,
  `user_id` varchar(255) DEFAULT NULL,
  `source` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`plan_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `workout_plan_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `app_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `workout_plan`
--

LOCK TABLES `workout_plan` WRITE;
/*!40000 ALTER TABLE `workout_plan` DISABLE KEYS */;
/*!40000 ALTER TABLE `workout_plan` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `workout_session`
--

DROP TABLE IF EXISTS `workout_session`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `workout_session` (
  `session_id` varchar(255) NOT NULL,
  `plan_id` varchar(255) DEFAULT NULL,
  `user_id` varchar(255) DEFAULT NULL,
  `workout_date` date DEFAULT NULL,
  `workout_type` varchar(255) DEFAULT NULL,
  `muscle_group` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`session_id`),
  KEY `plan_id` (`plan_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `workout_session_ibfk_1` FOREIGN KEY (`plan_id`) REFERENCES `workout_plan` (`plan_id`),
  CONSTRAINT `workout_session_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `app_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `workout_session`
--

LOCK TABLES `workout_session` WRITE;
/*!40000 ALTER TABLE `workout_session` DISABLE KEYS */;
/*!40000 ALTER TABLE `workout_session` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-02-14  1:22:16
