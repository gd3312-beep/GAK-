USE GAK;

-- Store parsed workout plan details (PDF upload)
SET @db_name = DATABASE();

SET @has_plan_name = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db_name AND table_name = 'workout_plan' AND column_name = 'plan_name'
);
SET @sql = IF(
  @has_plan_name = 0,
  'ALTER TABLE workout_plan ADD COLUMN plan_name VARCHAR(255) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_schedule_start_time = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db_name AND table_name = 'workout_plan' AND column_name = 'schedule_start_time'
);
SET @sql = IF(
  @has_schedule_start_time = 0,
  'ALTER TABLE workout_plan ADD COLUMN schedule_start_time TIME NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_schedule_end_time = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db_name AND table_name = 'workout_plan' AND column_name = 'schedule_end_time'
);
SET @sql = IF(
  @has_schedule_end_time = 0,
  'ALTER TABLE workout_plan ADD COLUMN schedule_end_time TIME NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_file_path = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db_name AND table_name = 'workout_plan' AND column_name = 'file_path'
);
SET @sql = IF(
  @has_file_path = 0,
  'ALTER TABLE workout_plan ADD COLUMN file_path VARCHAR(500) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS workout_plan_exercise (
  exercise_id VARCHAR(255) PRIMARY KEY,
  plan_id VARCHAR(255) NOT NULL,
  day_label VARCHAR(255) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  exercise_name VARCHAR(255) NOT NULL,
  set_count INT NULL,
  reps VARCHAR(50) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (plan_id) REFERENCES workout_plan(plan_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Backward-compatible rename for old schema variants.
SET @has_sets = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db_name AND table_name = 'workout_plan_exercise' AND column_name = 'sets'
);
SET @has_set_count = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db_name AND table_name = 'workout_plan_exercise' AND column_name = 'set_count'
);
SET @sql = IF(
  @has_sets = 1 AND @has_set_count = 0,
  'ALTER TABLE workout_plan_exercise RENAME COLUMN sets TO set_count',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_index = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db_name
    AND table_name = 'workout_plan_exercise'
    AND index_name = 'idx_workout_plan_exercise_plan'
);
SET @sql = IF(
  @has_index = 0,
  'CREATE INDEX idx_workout_plan_exercise_plan ON workout_plan_exercise (plan_id, sort_order)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
