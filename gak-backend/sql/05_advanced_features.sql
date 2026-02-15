USE GAK;

-- OAuth and token storage on user
ALTER TABLE app_user
  ADD COLUMN google_id VARCHAR(255) NULL,
  ADD COLUMN google_access_token TEXT NULL,
  ADD COLUMN google_refresh_token TEXT NULL,
  ADD COLUMN google_token_expiry DATETIME NULL,
  ADD COLUMN fit_google_account_id VARCHAR(255) NULL;

CREATE UNIQUE INDEX uq_app_user_google_id ON app_user (google_id);
CREATE INDEX idx_app_user_fit_google_account ON app_user (fit_google_account_id);

-- New multi-account Google integration storage.
CREATE TABLE IF NOT EXISTS google_account (
  account_id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  google_id VARCHAR(255) NOT NULL,
  google_email VARCHAR(255) NULL,
  google_name VARCHAR(255) NULL,
  google_access_token TEXT NOT NULL,
  google_refresh_token TEXT NULL,
  google_token_expiry DATETIME NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES app_user(user_id)
) ENGINE=InnoDB;

CREATE UNIQUE INDEX uq_google_account_user_google_id ON google_account (user_id, google_id);
CREATE INDEX idx_google_account_user_primary ON google_account (user_id, is_primary, updated_at);
CREATE INDEX idx_google_account_refresh ON google_account (google_refresh_token(255));

-- Backfill legacy single-account columns into the new table on bootstrap/reset.
INSERT INTO google_account (
  account_id,
  user_id,
  google_id,
  google_access_token,
  google_refresh_token,
  google_token_expiry,
  is_primary
)
SELECT
  UUID(),
  au.user_id,
  au.google_id,
  au.google_access_token,
  au.google_refresh_token,
  au.google_token_expiry,
  TRUE
FROM app_user au
WHERE au.google_id IS NOT NULL
  AND au.google_access_token IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM google_account ga
    WHERE ga.user_id = au.user_id
      AND ga.google_id = au.google_id
  );

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
  source_message_id VARCHAR(255) NULL,
  source_account_email VARCHAR(255) NULL,
  confidence_score FLOAT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES app_user(user_id)
) ENGINE=InnoDB;

CREATE UNIQUE INDEX uq_email_event_message
  ON email_event (user_id, source, source_account_email, source_message_id);

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

-- One-time OAuth nonce storage to prevent callback replay.
CREATE TABLE IF NOT EXISTS oauth_state_nonce (
  nonce VARCHAR(80) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES app_user(user_id)
) ENGINE=InnoDB;

CREATE INDEX idx_oauth_state_user_expiry ON oauth_state_nonce (user_id, expires_at);
