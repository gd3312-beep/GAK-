USE GAK;

-- Keep the original schema shape, add safety constraints/indexes idempotently.

SET @uq_app_user_email_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'app_user'
    AND index_name = 'uq_app_user_email'
);
SET @uq_app_user_email_dups := (
  SELECT COUNT(1)
  FROM (
    SELECT email
    FROM app_user
    WHERE email IS NOT NULL AND email <> ''
    GROUP BY email
    HAVING COUNT(*) > 1
  ) d
);
SET @uq_app_user_email_sql := IF(
  @uq_app_user_email_exists = 0 AND @uq_app_user_email_dups = 0,
  'ALTER TABLE app_user ADD UNIQUE INDEX uq_app_user_email (email)',
  'SELECT 1'
);
PREPARE uq_app_user_email_stmt FROM @uq_app_user_email_sql;
EXECUTE uq_app_user_email_stmt;
DEALLOCATE PREPARE uq_app_user_email_stmt;

SET @uq_academic_profile_user_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'academic_profile'
    AND index_name = 'uq_academic_profile_user'
);
SET @uq_academic_profile_user_dups := (
  SELECT COUNT(1)
  FROM (
    SELECT user_id
    FROM academic_profile
    WHERE user_id IS NOT NULL AND user_id <> ''
    GROUP BY user_id
    HAVING COUNT(*) > 1
  ) d
);
SET @uq_academic_profile_user_sql := IF(
  @uq_academic_profile_user_exists = 0 AND @uq_academic_profile_user_dups = 0,
  'ALTER TABLE academic_profile ADD UNIQUE INDEX uq_academic_profile_user (user_id)',
  'SELECT 1'
);
PREPARE uq_academic_profile_user_stmt FROM @uq_academic_profile_user_sql;
EXECUTE uq_academic_profile_user_stmt;
DEALLOCATE PREPARE uq_academic_profile_user_stmt;

SET @idx_timetable_section_day_time_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'timetable_entry'
    AND index_name = 'idx_timetable_section_day_time'
);
SET @idx_timetable_section_day_time_sql := IF(
  @idx_timetable_section_day_time_exists = 0,
  'CREATE INDEX idx_timetable_section_day_time ON timetable_entry (section_id, day_order, start_time)',
  'SELECT 1'
);
PREPARE idx_timetable_section_day_time_stmt FROM @idx_timetable_section_day_time_sql;
EXECUTE idx_timetable_section_day_time_stmt;
DEALLOCATE PREPARE idx_timetable_section_day_time_stmt;

SET @idx_academic_calendar_unit_date_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'academic_calendar'
    AND index_name = 'idx_academic_calendar_unit_date'
);
SET @idx_academic_calendar_unit_date_sql := IF(
  @idx_academic_calendar_unit_date_exists = 0,
  'CREATE INDEX idx_academic_calendar_unit_date ON academic_calendar (academic_unit_id, date, day_order)',
  'SELECT 1'
);
PREPARE idx_academic_calendar_unit_date_stmt FROM @idx_academic_calendar_unit_date_sql;
EXECUTE idx_academic_calendar_unit_date_stmt;
DEALLOCATE PREPARE idx_academic_calendar_unit_date_stmt;

SET @uq_unified_timetable_shared_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'unified_timetable'
    AND index_name = 'uq_unified_timetable_shared'
);
SET @uq_unified_timetable_shared_dups := (
  SELECT COUNT(1)
  FROM (
    SELECT academic_unit_id, campus_id, semester, batch
    FROM unified_timetable
    GROUP BY academic_unit_id, campus_id, semester, batch
    HAVING COUNT(*) > 1
  ) d
);
SET @uq_unified_timetable_shared_sql := IF(
  @uq_unified_timetable_shared_exists = 0 AND @uq_unified_timetable_shared_dups = 0,
  'CREATE UNIQUE INDEX uq_unified_timetable_shared ON unified_timetable (academic_unit_id, campus_id, semester, batch)',
  'SELECT 1'
);
PREPARE uq_unified_timetable_shared_stmt FROM @uq_unified_timetable_shared_sql;
EXECUTE uq_unified_timetable_shared_stmt;
DEALLOCATE PREPARE uq_unified_timetable_shared_stmt;

SET @uq_academic_calendar_event_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'academic_calendar'
    AND index_name = 'uq_academic_calendar_unit_date_event'
);
SET @uq_academic_calendar_event_dups := (
  SELECT COUNT(1)
  FROM (
    SELECT academic_unit_id, date, event_type, LEFT(COALESCE(description, ''), 100) AS description_key
    FROM academic_calendar
    GROUP BY academic_unit_id, date, event_type, LEFT(COALESCE(description, ''), 100)
    HAVING COUNT(*) > 1
  ) d
);
SET @uq_academic_calendar_event_sql := IF(
  @uq_academic_calendar_event_exists = 0 AND @uq_academic_calendar_event_dups = 0,
  'CREATE UNIQUE INDEX uq_academic_calendar_unit_date_event ON academic_calendar (academic_unit_id, date, event_type, description(100))',
  'SELECT 1'
);
PREPARE uq_academic_calendar_event_stmt FROM @uq_academic_calendar_event_sql;
EXECUTE uq_academic_calendar_event_stmt;
DEALLOCATE PREPARE uq_academic_calendar_event_stmt;

SET @idx_attendance_user_subject_date_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'attendance_record'
    AND index_name = 'idx_attendance_user_subject_date'
);
SET @idx_attendance_user_subject_date_sql := IF(
  @idx_attendance_user_subject_date_exists = 0,
  'CREATE INDEX idx_attendance_user_subject_date ON attendance_record (user_id, subject_id, class_date)',
  'SELECT 1'
);
PREPARE idx_attendance_user_subject_date_stmt FROM @idx_attendance_user_subject_date_sql;
EXECUTE idx_attendance_user_subject_date_stmt;
DEALLOCATE PREPARE idx_attendance_user_subject_date_stmt;

SET @idx_marks_user_subject_time_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'marks_record'
    AND index_name = 'idx_marks_user_subject_time'
);
SET @idx_marks_user_subject_time_sql := IF(
  @idx_marks_user_subject_time_exists = 0,
  'CREATE INDEX idx_marks_user_subject_time ON marks_record (user_id, subject_id, recorded_at)',
  'SELECT 1'
);
PREPARE idx_marks_user_subject_time_stmt FROM @idx_marks_user_subject_time_sql;
EXECUTE idx_marks_user_subject_time_stmt;
DEALLOCATE PREPARE idx_marks_user_subject_time_stmt;

SET @idx_academic_profile_section_user_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'academic_profile'
    AND index_name = 'idx_academic_profile_section_user'
);
SET @idx_academic_profile_section_user_sql := IF(
  @idx_academic_profile_section_user_exists = 0,
  'CREATE INDEX idx_academic_profile_section_user ON academic_profile (section_id, user_id)',
  'SELECT 1'
);
PREPARE idx_academic_profile_section_user_stmt FROM @idx_academic_profile_section_user_sql;
EXECUTE idx_academic_profile_section_user_stmt;
DEALLOCATE PREPARE idx_academic_profile_section_user_stmt;

SET @idx_academic_profile_user_unit_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'academic_profile'
    AND index_name = 'idx_academic_profile_user_unit'
);
SET @idx_academic_profile_user_unit_sql := IF(
  @idx_academic_profile_user_unit_exists = 0,
  'CREATE INDEX idx_academic_profile_user_unit ON academic_profile (user_id, academic_unit_id, section_id)',
  'SELECT 1'
);
PREPARE idx_academic_profile_user_unit_stmt FROM @idx_academic_profile_user_unit_sql;
EXECUTE idx_academic_profile_user_unit_stmt;
DEALLOCATE PREPARE idx_academic_profile_user_unit_stmt;

SET @idx_timetable_section_subject_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'timetable_entry'
    AND index_name = 'idx_timetable_section_subject'
);
SET @idx_timetable_section_subject_sql := IF(
  @idx_timetable_section_subject_exists = 0,
  'CREATE INDEX idx_timetable_section_subject ON timetable_entry (section_id, subject_id)',
  'SELECT 1'
);
PREPARE idx_timetable_section_subject_stmt FROM @idx_timetable_section_subject_sql;
EXECUTE idx_timetable_section_subject_stmt;
DEALLOCATE PREPARE idx_timetable_section_subject_stmt;

SET @idx_marks_subject_user_time_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'marks_record'
    AND index_name = 'idx_marks_subject_user_time'
);
SET @idx_marks_subject_user_time_sql := IF(
  @idx_marks_subject_user_time_exists = 0,
  'CREATE INDEX idx_marks_subject_user_time ON marks_record (subject_id, user_id, recorded_at)',
  'SELECT 1'
);
PREPARE idx_marks_subject_user_time_stmt FROM @idx_marks_subject_user_time_sql;
EXECUTE idx_marks_subject_user_time_stmt;
DEALLOCATE PREPARE idx_marks_subject_user_time_stmt;

SET @idx_calendar_event_user_type_date_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'calendar_event'
    AND index_name = 'idx_calendar_event_user_type_date'
);
SET @idx_calendar_event_user_type_date_sql := IF(
  @idx_calendar_event_user_type_date_exists = 0,
  'CREATE INDEX idx_calendar_event_user_type_date ON calendar_event (user_id, event_type, event_date)',
  'SELECT 1'
);
PREPARE idx_calendar_event_user_type_date_stmt FROM @idx_calendar_event_user_type_date_sql;
EXECUTE idx_calendar_event_user_type_date_stmt;
DEALLOCATE PREPARE idx_calendar_event_user_type_date_stmt;

-- Remove legacy Academia cache tables after canonical migration.
DROP TABLE IF EXISTS academia_timetable_cache;
DROP TABLE IF EXISTS academia_marks_cache;
DROP TABLE IF EXISTS academia_attendance_cache;

DROP VIEW IF EXISTS day_order_mapping;
CREATE VIEW day_order_mapping AS
SELECT
  calendar_id AS mapping_id,
  academic_unit_id,
  date AS calendar_date,
  day_order,
  event_type,
  description,
  academic_year
FROM academic_calendar;
