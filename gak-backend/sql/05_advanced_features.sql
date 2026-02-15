USE GAK;

-- OAuth and token storage on user
ALTER TABLE app_user
  ADD COLUMN google_id VARCHAR(255) NULL,
  ADD COLUMN google_access_token TEXT NULL,
  ADD COLUMN google_refresh_token TEXT NULL,
  ADD COLUMN google_token_expiry DATETIME NULL;

CREATE UNIQUE INDEX uq_app_user_google_id ON app_user (google_id);

-- Sync fields for calendar and workout entities
ALTER TABLE calendar_event
  ADD COLUMN google_event_id VARCHAR(255) NULL,
  ADD COLUMN sync_status ENUM('synced', 'pending', 'failed') NOT NULL DEFAULT 'pending';

ALTER TABLE workout_session
  ADD COLUMN duration_minutes INT NOT NULL DEFAULT 30,
  ADD COLUMN calories_burned FLOAT NOT NULL DEFAULT 0,
  ADD COLUMN google_fit_session_id VARCHAR(255) NULL,
  ADD COLUMN sync_status ENUM('synced', 'pending', 'failed') NOT NULL DEFAULT 'pending';

-- Email parsing output
CREATE TABLE IF NOT EXISTS email_event (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  parsed_deadline DATETIME NULL,
  source ENUM('gmail') NOT NULL,
  confidence_score FLOAT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES app_user(user_id)
) ENGINE=InnoDB;

-- Universal behavior log
CREATE TABLE IF NOT EXISTS user_behavior_log (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  domain ENUM('fitness', 'academic', 'nutrition') NOT NULL,
  entity_id VARCHAR(255) NOT NULL,
  action ENUM('done', 'skipped', 'submitted', 'missed') NOT NULL,
  timestamp DATETIME NOT NULL,
  day_of_week INT NOT NULL,
  hour_of_day INT NOT NULL,
  exam_week BOOLEAN NOT NULL DEFAULT FALSE,
  attendance_pressure BOOLEAN NOT NULL DEFAULT FALSE,
  FOREIGN KEY (user_id) REFERENCES app_user(user_id)
) ENGINE=InnoDB;

CREATE INDEX idx_behavior_user_domain_time ON user_behavior_log (user_id, domain, timestamp);

-- Derived metrics tables
CREATE TABLE IF NOT EXISTS fitness_behavior_metrics (
  user_id VARCHAR(255) PRIMARY KEY,
  skip_rate FLOAT NOT NULL,
  consistency_score INT NOT NULL,
  best_time_slot INT NOT NULL,
  worst_day INT NOT NULL,
  exam_week_drop_percentage FLOAT NOT NULL,
  last_updated DATETIME NOT NULL,
  FOREIGN KEY (user_id) REFERENCES app_user(user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS academic_behavior_metrics (
  user_id VARCHAR(255) PRIMARY KEY,
  avg_attendance FLOAT NOT NULL,
  risk_subject_count INT NOT NULL,
  exam_week_stress_index FLOAT NOT NULL,
  goal_adherence_score FLOAT NOT NULL,
  last_updated DATETIME NOT NULL,
  FOREIGN KEY (user_id) REFERENCES app_user(user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS nutrition_behavior_metrics (
  user_id VARCHAR(255) PRIMARY KEY,
  avg_daily_calories FLOAT NOT NULL,
  over_limit_days INT NOT NULL,
  protein_deficit_ratio FLOAT NOT NULL,
  logging_consistency FLOAT NOT NULL,
  last_updated DATETIME NOT NULL,
  FOREIGN KEY (user_id) REFERENCES app_user(user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_behavior_summary (
  user_id VARCHAR(255) PRIMARY KEY,
  academic_score_index FLOAT NOT NULL,
  fitness_discipline_index FLOAT NOT NULL,
  nutrition_balance_index FLOAT NOT NULL,
  overall_consistency_index FLOAT NOT NULL,
  last_computed DATETIME NOT NULL,
  FOREIGN KEY (user_id) REFERENCES app_user(user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_recommendations (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  domain ENUM('academic', 'fitness', 'nutrition', 'cross_domain') NOT NULL,
  recommendation_text VARCHAR(1000) NOT NULL,
  generated_at DATETIME NOT NULL,
  acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  FOREIGN KEY (user_id) REFERENCES app_user(user_id)
) ENGINE=InnoDB;

CREATE INDEX idx_recommendation_user_time ON user_recommendations (user_id, generated_at);
