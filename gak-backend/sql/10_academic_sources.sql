USE GAK;

-- Provider catalog for academic source filtering.
CREATE TABLE IF NOT EXISTS academic_provider (
  provider_code VARCHAR(64) PRIMARY KEY,
  provider_name VARCHAR(255) NOT NULL,
  provider_group ENUM('college', 'platform', 'hackathon', 'other') NOT NULL DEFAULT 'other',
  default_registered BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO academic_provider (provider_code, provider_name, provider_group, default_registered)
VALUES
  ('college', 'College / University', 'college', TRUE),
  ('classroom', 'Google Classroom', 'platform', TRUE),
  ('nptel', 'NPTEL', 'platform', TRUE),
  ('coursera', 'Coursera', 'platform', FALSE),
  ('udemy', 'Udemy', 'platform', FALSE),
  ('hackathon', 'Hackathon', 'hackathon', FALSE),
  ('other', 'Other', 'other', FALSE)
ON DUPLICATE KEY UPDATE
  provider_name = VALUES(provider_name),
  provider_group = VALUES(provider_group),
  default_registered = VALUES(default_registered);

-- User-specific tracked sources/courses used to keep only relevant registered deadlines.
CREATE TABLE IF NOT EXISTS academic_enrollment (
  enrollment_id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  provider_code VARCHAR(64) NOT NULL,
  source_type ENUM('course', 'classroom', 'hackathon', 'other') NOT NULL DEFAULT 'course',
  source_key VARCHAR(255) NOT NULL,
  source_name VARCHAR(255) NOT NULL,
  sender_email VARCHAR(255) NULL,
  is_registered BOOLEAN NOT NULL DEFAULT FALSE,
  registration_mode ENUM('auto', 'manual') NOT NULL DEFAULT 'auto',
  status ENUM('active', 'completed', 'expired', 'dropped') NOT NULL DEFAULT 'active',
  auto_delete_on_complete BOOLEAN NOT NULL DEFAULT TRUE,
  starts_on DATE NULL,
  ends_on DATE NULL,
  first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES app_user(user_id),
  FOREIGN KEY (provider_code) REFERENCES academic_provider(provider_code)
) ENGINE=InnoDB;

SET @ae_uq_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'academic_enrollment'
    AND index_name = 'uq_academic_enrollment_user_provider_key'
);
SET @ae_uq_sql := IF(
  @ae_uq_exists = 0,
  'CREATE UNIQUE INDEX uq_academic_enrollment_user_provider_key ON academic_enrollment (user_id, provider_code, source_key)',
  'SELECT 1'
);
PREPARE ae_uq_stmt FROM @ae_uq_sql;
EXECUTE ae_uq_stmt;
DEALLOCATE PREPARE ae_uq_stmt;

SET @ae_idx_status_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'academic_enrollment'
    AND index_name = 'idx_academic_enrollment_user_status_ends'
);
SET @ae_idx_status_sql := IF(
  @ae_idx_status_exists = 0,
  'CREATE INDEX idx_academic_enrollment_user_status_ends ON academic_enrollment (user_id, status, ends_on)',
  'SELECT 1'
);
PREPARE ae_idx_status_stmt FROM @ae_idx_status_sql;
EXECUTE ae_idx_status_stmt;
DEALLOCATE PREPARE ae_idx_status_stmt;

SET @ae_idx_registered_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'academic_enrollment'
    AND index_name = 'idx_academic_enrollment_user_registered'
);
SET @ae_idx_registered_sql := IF(
  @ae_idx_registered_exists = 0,
  'CREATE INDEX idx_academic_enrollment_user_registered ON academic_enrollment (user_id, is_registered, last_seen_at)',
  'SELECT 1'
);
PREPARE ae_idx_registered_stmt FROM @ae_idx_registered_sql;
EXECUTE ae_idx_registered_stmt;
DEALLOCATE PREPARE ae_idx_registered_stmt;

-- Idempotent add for older installs.
SET @ae_registration_mode_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'academic_enrollment'
    AND COLUMN_NAME = 'registration_mode'
);
SET @ae_registration_mode_sql := IF(
  @ae_registration_mode_exists = 0,
  'ALTER TABLE academic_enrollment ADD COLUMN registration_mode ENUM(''auto'', ''manual'') NOT NULL DEFAULT ''auto'' AFTER is_registered',
  'SELECT 1'
);
PREPARE ae_registration_mode_stmt FROM @ae_registration_mode_sql;
EXECUTE ae_registration_mode_stmt;
DEALLOCATE PREPARE ae_registration_mode_stmt;
