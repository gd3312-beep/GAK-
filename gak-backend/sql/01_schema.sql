CREATE DATABASE IF NOT EXISTS GAK;
USE GAK;

CREATE TABLE university (
  university_id VARCHAR(255) PRIMARY KEY,
  university_name VARCHAR(255)
) ENGINE=InnoDB;

CREATE TABLE campus (
  campus_id VARCHAR(255) PRIMARY KEY,
  campus_name VARCHAR(255),
  university_id VARCHAR(255),
  FOREIGN KEY (university_id) REFERENCES university(university_id)
) ENGINE=InnoDB;

CREATE TABLE academic_unit (
  academic_unit_id VARCHAR(255) PRIMARY KEY,
  unit_name VARCHAR(255),
  unit_type VARCHAR(255),
  description VARCHAR(255),
  campus_id VARCHAR(255),
  university_id VARCHAR(255),
  FOREIGN KEY (campus_id) REFERENCES campus(campus_id),
  FOREIGN KEY (university_id) REFERENCES university(university_id)
) ENGINE=InnoDB;

CREATE TABLE academic_calendar (
  calendar_id VARCHAR(255) PRIMARY KEY,
  academic_year INT,
  date DATE,
  day_order INT,
  event_type VARCHAR(255),
  description VARCHAR(255),
  academic_unit_id VARCHAR(255),
  FOREIGN KEY (academic_unit_id) REFERENCES academic_unit(academic_unit_id)
) ENGINE=InnoDB;

CREATE TABLE unified_timetable (
  unified_timetable_id VARCHAR(255) PRIMARY KEY,
  academic_year INT,
  semester INT,
  batch VARCHAR(255),
  academic_unit_id VARCHAR(255),
  campus_id VARCHAR(255),
  FOREIGN KEY (academic_unit_id) REFERENCES academic_unit(academic_unit_id),
  FOREIGN KEY (campus_id) REFERENCES campus(campus_id)
) ENGINE=InnoDB;

CREATE TABLE faculty (
  faculty_id VARCHAR(255) PRIMARY KEY,
  faculty_name VARCHAR(255),
  department VARCHAR(255)
) ENGINE=InnoDB;

CREATE TABLE classroom (
  classroom_id VARCHAR(255) PRIMARY KEY,
  room_number VARCHAR(255),
  building_name VARCHAR(255)
) ENGINE=InnoDB;

CREATE TABLE subject (
  subject_id VARCHAR(255) PRIMARY KEY,
  subject_name VARCHAR(255),
  credits INT,
  minimum_attendance_percentage FLOAT,
  academic_unit_id VARCHAR(255),
  program VARCHAR(255),
  semester INT,
  FOREIGN KEY (academic_unit_id) REFERENCES academic_unit(academic_unit_id)
) ENGINE=InnoDB;

CREATE TABLE section (
  section_id VARCHAR(255) PRIMARY KEY,
  section_name VARCHAR(255),
  academic_year INT,
  semester INT,
  program VARCHAR(255),
  academic_unit_id VARCHAR(255),
  FOREIGN KEY (academic_unit_id) REFERENCES academic_unit(academic_unit_id)
) ENGINE=InnoDB;

CREATE TABLE app_user (
  user_id VARCHAR(255) PRIMARY KEY,
  full_name VARCHAR(255),
  email VARCHAR(255),
  password_hash VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE timetable_entry (
  timetable_entry_id VARCHAR(255) PRIMARY KEY,
  unified_timetable_id VARCHAR(255),
  section_id VARCHAR(255),
  subject_id VARCHAR(255),
  faculty_id VARCHAR(255),
  classroom_id VARCHAR(255),
  day_order INT,
  start_time TIME,
  end_time TIME,
  FOREIGN KEY (unified_timetable_id) REFERENCES unified_timetable(unified_timetable_id),
  FOREIGN KEY (faculty_id) REFERENCES faculty(faculty_id),
  FOREIGN KEY (classroom_id) REFERENCES classroom(classroom_id)
) ENGINE=InnoDB;

CREATE TABLE academic_profile (
  academic_profile_id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255),
  university_id VARCHAR(255),
  campus_id VARCHAR(255),
  academic_unit_id VARCHAR(255),
  section_id VARCHAR(255),
  program VARCHAR(255),
  branch VARCHAR(255),
  admission_year INT,
  current_semester INT,
  FOREIGN KEY (user_id) REFERENCES app_user(user_id),
  FOREIGN KEY (university_id) REFERENCES university(university_id),
  FOREIGN KEY (campus_id) REFERENCES campus(campus_id),
  FOREIGN KEY (academic_unit_id) REFERENCES academic_unit(academic_unit_id),
  FOREIGN KEY (section_id) REFERENCES section(section_id)
) ENGINE=InnoDB;

CREATE TABLE attendance_record (
  attendance_id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255),
  subject_id VARCHAR(255),
  timetable_entry_id VARCHAR(255),
  class_date DATE,
  attended TINYINT(1),
  FOREIGN KEY (user_id) REFERENCES app_user(user_id),
  FOREIGN KEY (subject_id) REFERENCES subject(subject_id),
  FOREIGN KEY (timetable_entry_id) REFERENCES timetable_entry(timetable_entry_id)
) ENGINE=InnoDB;

CREATE TABLE marks_record (
  marks_id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255),
  subject_id VARCHAR(255),
  component_type VARCHAR(255),
  score FLOAT,
  max_score FLOAT,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES app_user(user_id),
  FOREIGN KEY (subject_id) REFERENCES subject(subject_id)
) ENGINE=InnoDB;

CREATE TABLE academic_goal (
  goal_id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255),
  subject_id VARCHAR(255),
  goal_type VARCHAR(255),
  target_value FLOAT,
  deadline_date DATE,
  status VARCHAR(255),
  FOREIGN KEY (user_id) REFERENCES app_user(user_id),
  FOREIGN KEY (subject_id) REFERENCES subject(subject_id)
) ENGINE=InnoDB;

CREATE TABLE workout_plan (
  plan_id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255),
  source VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES app_user(user_id)
) ENGINE=InnoDB;

CREATE TABLE workout_session (
  session_id VARCHAR(255) PRIMARY KEY,
  plan_id VARCHAR(255),
  user_id VARCHAR(255),
  workout_date DATE,
  workout_type VARCHAR(255),
  muscle_group VARCHAR(255),
  FOREIGN KEY (plan_id) REFERENCES workout_plan(plan_id),
  FOREIGN KEY (user_id) REFERENCES app_user(user_id)
) ENGINE=InnoDB;

CREATE TABLE workout_action (
  action_id VARCHAR(255) PRIMARY KEY,
  session_id VARCHAR(255),
  user_id VARCHAR(255),
  status VARCHAR(255),
  performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES workout_session(session_id),
  FOREIGN KEY (user_id) REFERENCES app_user(user_id)
) ENGINE=InnoDB;

CREATE TABLE activity_log (
  activity_id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255),
  activity_type VARCHAR(255),
  calories_burned FLOAT,
  duration INT,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  source VARCHAR(255),
  FOREIGN KEY (user_id) REFERENCES app_user(user_id)
) ENGINE=InnoDB;

CREATE TABLE body_metric (
  metric_id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255),
  height FLOAT,
  weight FLOAT,
  body_fat_percentage FLOAT,
  recorded_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES app_user(user_id)
) ENGINE=InnoDB;

CREATE TABLE food_image (
  image_id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255),
  image_url VARCHAR(255),
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES app_user(user_id)
) ENGINE=InnoDB;

CREATE TABLE detected_food_item (
  detected_id VARCHAR(255) PRIMARY KEY,
  image_id VARCHAR(255),
  food_name VARCHAR(255),
  confidence_score FLOAT,
  FOREIGN KEY (image_id) REFERENCES food_image(image_id)
) ENGINE=InnoDB;

CREATE TABLE confirmed_food_item (
  confirmed_id VARCHAR(255) PRIMARY KEY,
  detected_id VARCHAR(255),
  quantity FLOAT,
  calories FLOAT,
  protein FLOAT,
  carbs FLOAT,
  fats FLOAT,
  FOREIGN KEY (detected_id) REFERENCES detected_food_item(detected_id)
) ENGINE=InnoDB;

CREATE TABLE food_log (
  food_log_id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255),
  log_date DATE,
  total_calories FLOAT,
  FOREIGN KEY (user_id) REFERENCES app_user(user_id)
) ENGINE=InnoDB;

CREATE TABLE calendar_event (
  event_id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255),
  event_date DATE,
  event_type VARCHAR(255),
  title VARCHAR(255),
  FOREIGN KEY (user_id) REFERENCES app_user(user_id)
) ENGINE=InnoDB;

CREATE TABLE integration_status (
  integration_id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255),
  integration_type VARCHAR(255),
  status VARCHAR(255),
  last_synced_at TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES app_user(user_id)
) ENGINE=InnoDB;