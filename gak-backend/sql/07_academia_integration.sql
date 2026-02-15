USE GAK;

CREATE TABLE IF NOT EXISTS academia_account (
  user_id VARCHAR(255) PRIMARY KEY,
  college_email VARCHAR(255) NOT NULL,
  password_encrypted TEXT NOT NULL,
  status ENUM('connected', 'failed', 'disconnected') NOT NULL DEFAULT 'connected',
  last_synced_at DATETIME NULL,
  last_error VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES app_user(user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS academia_timetable_cache (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  day_order INT NULL,
  day_label VARCHAR(50) NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  subject_name VARCHAR(255) NOT NULL,
  faculty_name VARCHAR(255) NULL,
  room_label VARCHAR(255) NULL,
  captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES app_user(user_id)
) ENGINE=InnoDB;

CREATE INDEX idx_academia_timetable_user_day
  ON academia_timetable_cache (user_id, day_order, start_time);

CREATE TABLE IF NOT EXISTS academia_marks_cache (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  subject_name VARCHAR(255) NOT NULL,
  component_name VARCHAR(255) NULL,
  score FLOAT NOT NULL,
  max_score FLOAT NOT NULL,
  percentage FLOAT NOT NULL,
  captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES app_user(user_id)
) ENGINE=InnoDB;

CREATE INDEX idx_academia_marks_user_subject
  ON academia_marks_cache (user_id, subject_name);

CREATE TABLE IF NOT EXISTS academia_attendance_cache (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  subject_name VARCHAR(255) NOT NULL,
  attended_classes INT NOT NULL,
  total_classes INT NOT NULL,
  attendance_percentage FLOAT NOT NULL,
  captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES app_user(user_id)
) ENGINE=InnoDB;

CREATE INDEX idx_academia_attendance_user_subject
  ON academia_attendance_cache (user_id, subject_name);
