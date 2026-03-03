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

-- Legacy cache tables are removed; canonical tables are used instead:
-- unified_timetable, timetable_entry, academic_calendar, attendance_record, marks_record.
DROP TABLE IF EXISTS academia_timetable_cache;
DROP TABLE IF EXISTS academia_marks_cache;
DROP TABLE IF EXISTS academia_attendance_cache;
