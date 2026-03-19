USE GAK;

-- Guard/audit table for DB-side validation failures and failsafe automation.
CREATE TABLE IF NOT EXISTS system_guard_event (
  event_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  event_source ENUM('procedure', 'trigger') NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  entity_table VARCHAR(100) NULL,
  entity_id VARCHAR(255) NULL,
  user_id VARCHAR(255) NULL,
  severity ENUM('info', 'warning', 'error') NOT NULL DEFAULT 'info',
  message VARCHAR(1000) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_system_guard_user_time (user_id, created_at),
  INDEX idx_system_guard_severity_time (severity, created_at)
) ENGINE=InnoDB;

-- Extra uniqueness and read-optimization constraints used by routines/triggers.
SET @idx_attendance_unique_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'attendance_record'
    AND index_name = 'uq_attendance_user_subject_date'
);
SET @idx_attendance_unique_sql := IF(
  @idx_attendance_unique_exists = 0,
  'CREATE UNIQUE INDEX uq_attendance_user_subject_date ON attendance_record (user_id, subject_id, class_date)',
  'SELECT 1'
);
PREPARE idx_attendance_unique_stmt FROM @idx_attendance_unique_sql;
EXECUTE idx_attendance_unique_stmt;
DEALLOCATE PREPARE idx_attendance_unique_stmt;

SET @idx_marks_unique_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'marks_record'
    AND index_name = 'uq_marks_user_subject_component'
);
SET @idx_marks_unique_sql := IF(
  @idx_marks_unique_exists = 0,
  'CREATE UNIQUE INDEX uq_marks_user_subject_component ON marks_record (user_id, subject_id, component_type)',
  'SELECT 1'
);
PREPARE idx_marks_unique_stmt FROM @idx_marks_unique_sql;
EXECUTE idx_marks_unique_stmt;
DEALLOCATE PREPARE idx_marks_unique_stmt;

SET @idx_food_log_unique_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'food_log'
    AND index_name = 'uq_food_log_user_date'
);
SET @idx_food_log_unique_sql := IF(
  @idx_food_log_unique_exists = 0,
  'CREATE UNIQUE INDEX uq_food_log_user_date ON food_log (user_id, log_date)',
  'SELECT 1'
);
PREPARE idx_food_log_unique_stmt FROM @idx_food_log_unique_sql;
EXECUTE idx_food_log_unique_stmt;
DEALLOCATE PREPARE idx_food_log_unique_stmt;

SET @idx_behavior_unique_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'user_behavior_log'
    AND index_name = 'uq_behavior_user_domain_entity_action'
);
SET @idx_behavior_unique_sql := IF(
  @idx_behavior_unique_exists = 0,
  'CREATE UNIQUE INDEX uq_behavior_user_domain_entity_action ON user_behavior_log (user_id, domain, entity_id, action)',
  'SELECT 1'
);
PREPARE idx_behavior_unique_stmt FROM @idx_behavior_unique_sql;
EXECUTE idx_behavior_unique_stmt;
DEALLOCATE PREPARE idx_behavior_unique_stmt;

SET @idx_calendar_user_type_date_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'calendar_event'
    AND index_name = 'idx_calendar_event_user_type_date'
);
SET @idx_calendar_user_type_date_sql := IF(
  @idx_calendar_user_type_date_exists = 0,
  'CREATE INDEX idx_calendar_event_user_type_date ON calendar_event (user_id, event_type, event_date)',
  'SELECT 1'
);
PREPARE idx_calendar_user_type_date_stmt FROM @idx_calendar_user_type_date_sql;
EXECUTE idx_calendar_user_type_date_stmt;
DEALLOCATE PREPARE idx_calendar_user_type_date_stmt;

SET @idx_food_log_user_date_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'food_log'
    AND index_name = 'idx_food_log_user_date'
);
SET @idx_food_log_user_date_sql := IF(
  @idx_food_log_user_date_exists = 0,
  'CREATE INDEX idx_food_log_user_date ON food_log (user_id, log_date)',
  'SELECT 1'
);
PREPARE idx_food_log_user_date_stmt FROM @idx_food_log_user_date_sql;
EXECUTE idx_food_log_user_date_stmt;
DEALLOCATE PREPARE idx_food_log_user_date_stmt;

SET @idx_recommendation_ack_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'user_recommendations'
    AND index_name = 'idx_recommendation_user_ack_time'
);
SET @idx_recommendation_ack_sql := IF(
  @idx_recommendation_ack_exists = 0,
  'CREATE INDEX idx_recommendation_user_ack_time ON user_recommendations (user_id, acknowledged, generated_at)',
  'SELECT 1'
);
PREPARE idx_recommendation_ack_stmt FROM @idx_recommendation_ack_sql;
EXECUTE idx_recommendation_ack_stmt;
DEALLOCATE PREPARE idx_recommendation_ack_stmt;

DROP FUNCTION IF EXISTS fn_user_attendance_percentage;
DROP FUNCTION IF EXISTS fn_attendance_status;
DROP FUNCTION IF EXISTS fn_workout_completion_rate;
DROP FUNCTION IF EXISTS fn_goal_gap_to_target;

DELIMITER //

CREATE FUNCTION fn_user_attendance_percentage(
  p_user_id VARCHAR(255),
  p_subject_id VARCHAR(255)
)
RETURNS DECIMAL(5,2)
READS SQL DATA
DETERMINISTIC
BEGIN
  DECLARE v_pct DECIMAL(5,2);

  SELECT ROUND((SUM(attended) / NULLIF(COUNT(*), 0)) * 100, 2)
  INTO v_pct
  FROM attendance_record
  WHERE user_id = p_user_id
    AND subject_id = p_subject_id;

  RETURN COALESCE(v_pct, 0.00);
END //

CREATE FUNCTION fn_attendance_status(
  p_user_id VARCHAR(255),
  p_subject_id VARCHAR(255)
)
RETURNS VARCHAR(100)
READS SQL DATA
DETERMINISTIC
BEGIN
  DECLARE v_pct DECIMAL(5,2) DEFAULT 0.00;
  DECLARE v_min DECIMAL(5,2) DEFAULT 75.00;

  SET v_pct = fn_user_attendance_percentage(p_user_id, p_subject_id);

  SELECT COALESCE(minimum_attendance_percentage, 75)
  INTO v_min
  FROM subject
  WHERE subject_id = p_subject_id
  LIMIT 1;

  IF v_pct >= v_min THEN
    RETURN 'Safe';
  ELSEIF v_pct >= v_min - 10 THEN
    RETURN 'Warning';
  END IF;

  RETURN 'Critical';
END //

CREATE FUNCTION fn_workout_completion_rate(
  p_user_id VARCHAR(255),
  p_window_days INT
)
RETURNS DECIMAL(5,2)
READS SQL DATA
DETERMINISTIC
BEGIN
  DECLARE v_rate DECIMAL(5,2);

  SELECT ROUND(
    (
      COUNT(CASE WHEN LOWER(status) IN ('done', 'completed') THEN 1 END)
      / NULLIF(COUNT(*), 0)
    ) * 100,
    2
  )
  INTO v_rate
  FROM workout_action
  WHERE user_id = p_user_id
    AND (
      p_window_days IS NULL
      OR performed_at >= DATE_SUB(NOW(), INTERVAL p_window_days DAY)
    );

  RETURN COALESCE(v_rate, 0.00);
END //

CREATE FUNCTION fn_goal_gap_to_target(
  p_user_id VARCHAR(255),
  p_subject_id VARCHAR(255)
)
RETURNS DECIMAL(7,2)
READS SQL DATA
DETERMINISTIC
BEGIN
  DECLARE v_goal_type VARCHAR(255);
  DECLARE v_target DECIMAL(7,2);
  DECLARE v_current DECIMAL(7,2) DEFAULT 0.00;

  SELECT goal_type, target_value
  INTO v_goal_type, v_target
  FROM academic_goal
  WHERE user_id = p_user_id
    AND subject_id = p_subject_id
  ORDER BY deadline_date DESC
  LIMIT 1;

  IF v_goal_type IS NULL THEN
    RETURN 0.00;
  END IF;

  IF LOWER(v_goal_type) = 'attendance' THEN
    SET v_current = fn_user_attendance_percentage(p_user_id, p_subject_id);
  ELSE
    SELECT COALESCE(average_percentage, 0)
    INTO v_current
    FROM v_student_marks_summary
    WHERE user_id = p_user_id
      AND subject_id = p_subject_id
    LIMIT 1;
  END IF;

  RETURN ROUND(COALESCE(v_target, 0) - COALESCE(v_current, 0), 2);
END //

DROP PROCEDURE IF EXISTS sp_log_guard_event //
CREATE PROCEDURE sp_log_guard_event(
  IN p_event_source VARCHAR(20),
  IN p_event_type VARCHAR(100),
  IN p_entity_table VARCHAR(100),
  IN p_entity_id VARCHAR(255),
  IN p_user_id VARCHAR(255),
  IN p_severity VARCHAR(10),
  IN p_message VARCHAR(1000)
)
BEGIN
  INSERT INTO system_guard_event (
    event_source,
    event_type,
    entity_table,
    entity_id,
    user_id,
    severity,
    message
  )
  VALUES (
    p_event_source,
    p_event_type,
    p_entity_table,
    p_entity_id,
    p_user_id,
    p_severity,
    p_message
  );
END //

DROP PROCEDURE IF EXISTS sp_sync_calorie_alert //
CREATE PROCEDURE sp_sync_calorie_alert(
  IN p_user_id VARCHAR(255),
  IN p_log_date DATE,
  IN p_total_calories DECIMAL(10,2)
)
BEGIN
  DECLARE v_event_id VARCHAR(255);
  SET v_event_id = CONCAT('ce-nutrition-', p_user_id, '-', DATE_FORMAT(p_log_date, '%Y%m%d'));

  IF p_total_calories > 2400 THEN
    INSERT INTO calendar_event (
      event_id,
      user_id,
      event_date,
      event_type,
      title
    )
    VALUES (
      v_event_id,
      p_user_id,
      p_log_date,
      'nutrition',
      'Nutrition Review - High Calorie Day'
    )
    ON DUPLICATE KEY UPDATE
      event_date = VALUES(event_date),
      event_type = VALUES(event_type),
      title = VALUES(title);
  ELSE
    DELETE FROM calendar_event
    WHERE event_id = v_event_id;
  END IF;
END //

DROP PROCEDURE IF EXISTS sp_refresh_food_log_for_image //
CREATE PROCEDURE sp_refresh_food_log_for_image(
  IN p_image_id VARCHAR(255)
)
BEGIN
  DECLARE v_user_id VARCHAR(255);
  DECLARE v_log_date DATE;
  DECLARE v_total_calories DECIMAL(10,2) DEFAULT 0.00;
  DECLARE v_food_log_id VARCHAR(255);

  SELECT fi.user_id, DATE(fi.uploaded_at)
  INTO v_user_id, v_log_date
  FROM food_image fi
  WHERE fi.image_id = p_image_id
  LIMIT 1;

  IF v_user_id IS NOT NULL AND v_log_date IS NOT NULL THEN
    SELECT ROUND(COALESCE(SUM(cfi.calories * cfi.quantity), 0), 2)
    INTO v_total_calories
    FROM food_image fi
    JOIN detected_food_item dfi ON dfi.image_id = fi.image_id
    JOIN confirmed_food_item cfi ON cfi.detected_id = dfi.detected_id
    WHERE fi.user_id = v_user_id
      AND DATE(fi.uploaded_at) = v_log_date;

    SET v_food_log_id = CONCAT('flog-', v_user_id, '-', DATE_FORMAT(v_log_date, '%Y%m%d'));

    IF v_total_calories > 0 THEN
      INSERT INTO food_log (
        food_log_id,
        user_id,
        log_date,
        total_calories
      )
      VALUES (
        v_food_log_id,
        v_user_id,
        v_log_date,
        v_total_calories
      )
      ON DUPLICATE KEY UPDATE
        total_calories = VALUES(total_calories);
    ELSE
      DELETE FROM food_log
      WHERE user_id = v_user_id
        AND log_date = v_log_date;
    END IF;

    CALL sp_sync_calorie_alert(v_user_id, v_log_date, v_total_calories);
  END IF;
END //

DROP PROCEDURE IF EXISTS sp_safe_mark_attendance //
CREATE PROCEDURE sp_safe_mark_attendance(
  IN p_attendance_id VARCHAR(255),
  IN p_user_id VARCHAR(255),
  IN p_subject_id VARCHAR(255),
  IN p_timetable_entry_id VARCHAR(255),
  IN p_class_date DATE,
  IN p_attended TINYINT
)
BEGIN
  DECLARE v_user_exists INT DEFAULT 0;
  DECLARE v_subject_exists INT DEFAULT 0;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    CALL sp_log_guard_event(
      'procedure',
      'attendance_insert_failed',
      'attendance_record',
      p_attendance_id,
      p_user_id,
      'error',
      'Attendance write failed and the transaction was rolled back.'
    );
    RESIGNAL;
  END;

  START TRANSACTION;

  SELECT COUNT(*) INTO v_user_exists
  FROM app_user
  WHERE user_id = p_user_id;

  IF v_user_exists = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Invalid user_id supplied for attendance';
  END IF;

  SELECT COUNT(*) INTO v_subject_exists
  FROM subject
  WHERE subject_id = p_subject_id;

  IF v_subject_exists = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Invalid subject_id supplied for attendance';
  END IF;

  IF p_attended NOT IN (0, 1) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Attendance flag must be 0 or 1';
  END IF;

  INSERT INTO attendance_record (
    attendance_id,
    user_id,
    subject_id,
    timetable_entry_id,
    class_date,
    attended
  )
  VALUES (
    p_attendance_id,
    p_user_id,
    p_subject_id,
    NULLIF(p_timetable_entry_id, ''),
    p_class_date,
    p_attended
  );

  COMMIT;
END //

DROP PROCEDURE IF EXISTS sp_safe_add_marks //
CREATE PROCEDURE sp_safe_add_marks(
  IN p_marks_id VARCHAR(255),
  IN p_user_id VARCHAR(255),
  IN p_subject_id VARCHAR(255),
  IN p_component_type VARCHAR(255),
  IN p_score FLOAT,
  IN p_max_score FLOAT
)
BEGIN
  DECLARE v_user_exists INT DEFAULT 0;
  DECLARE v_subject_exists INT DEFAULT 0;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    CALL sp_log_guard_event(
      'procedure',
      'marks_insert_failed',
      'marks_record',
      p_marks_id,
      p_user_id,
      'error',
      'Marks write failed and the transaction was rolled back.'
    );
    RESIGNAL;
  END;

  START TRANSACTION;

  SELECT COUNT(*) INTO v_user_exists
  FROM app_user
  WHERE user_id = p_user_id;

  IF v_user_exists = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Invalid user_id supplied for marks';
  END IF;

  SELECT COUNT(*) INTO v_subject_exists
  FROM subject
  WHERE subject_id = p_subject_id;

  IF v_subject_exists = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Invalid subject_id supplied for marks';
  END IF;

  IF p_max_score <= 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'max_score must be greater than 0';
  END IF;

  IF p_score < 0 OR p_score > p_max_score THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'score must be between 0 and max_score';
  END IF;

  INSERT INTO marks_record (
    marks_id,
    user_id,
    subject_id,
    component_type,
    score,
    max_score
  )
  VALUES (
    p_marks_id,
    p_user_id,
    p_subject_id,
    LOWER(TRIM(p_component_type)),
    p_score,
    p_max_score
  );

  COMMIT;
END //

DROP PROCEDURE IF EXISTS sp_generate_self_alerts //
CREATE PROCEDURE sp_generate_self_alerts(
  IN p_user_id VARCHAR(255)
)
BEGIN
  DECLARE done INT DEFAULT FALSE;
  DECLARE v_subject_id VARCHAR(255);
  DECLARE v_subject_name VARCHAR(255);
  DECLARE v_goal_type VARCHAR(255);
  DECLARE v_target DECIMAL(7,2);
  DECLARE v_current DECIMAL(7,2);
  DECLARE v_gap DECIMAL(7,2);
  DECLARE v_status_message VARCHAR(255);
  DECLARE v_severity_rank INT;

  DECLARE cur CURSOR FOR
    SELECT
      g.subject_id,
      s.subject_name,
      g.goal_type,
      g.target_value,
      CASE
        WHEN LOWER(g.goal_type) = 'attendance' THEN fn_user_attendance_percentage(p_user_id, g.subject_id)
        ELSE COALESCE((
          SELECT average_percentage
          FROM v_student_marks_summary vm
          WHERE vm.user_id = p_user_id
            AND vm.subject_id = g.subject_id
          LIMIT 1
        ), 0)
      END AS current_value,
      fn_goal_gap_to_target(p_user_id, g.subject_id) AS gap_to_target
    FROM academic_goal g
    JOIN subject s ON s.subject_id = g.subject_id
    WHERE g.user_id = p_user_id
    ORDER BY s.subject_name;

  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

  DROP TEMPORARY TABLE IF EXISTS tmp_self_alerts;
  CREATE TEMPORARY TABLE tmp_self_alerts (
    subject_id VARCHAR(255),
    subject_name VARCHAR(255),
    goal_type VARCHAR(255),
    current_value DECIMAL(7,2),
    target_value DECIMAL(7,2),
    gap_to_target DECIMAL(7,2),
    status_message VARCHAR(255),
    severity_rank INT
  );

  OPEN cur;

  read_loop: LOOP
    FETCH cur INTO v_subject_id, v_subject_name, v_goal_type, v_target, v_current, v_gap;
    IF done THEN
      LEAVE read_loop;
    END IF;

    IF v_gap <= 0 THEN
      SET v_status_message = 'Goal achieved or exceeded';
      SET v_severity_rank = 1;
    ELSEIF v_gap <= 10 THEN
      SET v_status_message = 'Close to target - monitor consistently';
      SET v_severity_rank = 2;
    ELSE
      SET v_status_message = 'Needs intervention - large gap to target';
      SET v_severity_rank = 3;
    END IF;

    INSERT INTO tmp_self_alerts (
      subject_id,
      subject_name,
      goal_type,
      current_value,
      target_value,
      gap_to_target,
      status_message,
      severity_rank
    )
    VALUES (
      v_subject_id,
      v_subject_name,
      v_goal_type,
      v_current,
      v_target,
      v_gap,
      v_status_message,
      v_severity_rank
    );
  END LOOP;

  CLOSE cur;

  SELECT
    subject_id,
    subject_name,
    goal_type,
    current_value,
    target_value,
    gap_to_target,
    status_message
  FROM tmp_self_alerts
  ORDER BY severity_rank DESC, subject_name ASC;
END //

DROP PROCEDURE IF EXISTS sp_get_user_compact_snapshot //
CREATE PROCEDURE sp_get_user_compact_snapshot(
  IN p_user_id VARCHAR(255),
  IN p_log_date DATE
)
BEGIN
  SELECT JSON_OBJECT(
    'userId', p_user_id,
    'requestedDate', DATE_FORMAT(p_log_date, '%Y-%m-%d'),
    'attendanceOverall', COALESCE((
      SELECT ROUND((SUM(attended) / NULLIF(COUNT(*), 0)) * 100, 2)
      FROM attendance_record
      WHERE user_id = p_user_id
    ), 0),
    'workoutCompletionRate', fn_workout_completion_rate(p_user_id, 30),
    'subjectAttendance', COALESCE((
      SELECT JSON_ARRAYAGG(
        JSON_OBJECT(
          'subjectId', subject_id,
          'subjectName', subject_name,
          'attendancePercentage', attendance_percentage,
          'totalClasses', total_classes,
          'attendedClasses', attended_classes,
          'status', fn_attendance_status(p_user_id, subject_id)
        )
      )
      FROM v_student_attendance_summary
      WHERE user_id = p_user_id
    ), JSON_ARRAY()),
    'subjectPerformance', COALESCE((
      SELECT JSON_ARRAYAGG(
        JSON_OBJECT(
          'subjectId', subject_id,
          'subjectName', subject_name,
          'averagePercentage', average_percentage,
          'componentsCount', components_count
        )
      )
      FROM v_student_marks_summary
      WHERE user_id = p_user_id
    ), JSON_ARRAY()),
    'dailyNutrition', COALESCE((
      SELECT JSON_OBJECT(
        'logDate', DATE_FORMAT(log_date, '%Y-%m-%d'),
        'totalCalories', total_calories,
        'totalProtein', total_protein,
        'totalCarbs', total_carbs,
        'totalFats', total_fats
      )
      FROM Daily_Nutrition_View
      WHERE user_id = p_user_id
        AND log_date = p_log_date
      LIMIT 1
    ), JSON_OBJECT(
      'logDate', DATE_FORMAT(p_log_date, '%Y-%m-%d'),
      'totalCalories', 0,
      'totalProtein', 0,
      'totalCarbs', 0,
      'totalFats', 0
    )),
    'consistency', COALESCE((
      SELECT JSON_OBJECT(
        'academicScoreIndex', academic_score_index,
        'fitnessDisciplineIndex', fitness_discipline_index,
        'nutritionBalanceIndex', nutrition_balance_index,
        'overallConsistencyIndex', overall_consistency_index,
        'lastComputed', DATE_FORMAT(last_computed, '%Y-%m-%d %H:%i:%s')
      )
      FROM User_Consistency_View
      WHERE user_id = p_user_id
      LIMIT 1
    ), JSON_OBJECT()),
    'latestRecommendations', COALESCE((
      SELECT JSON_ARRAYAGG(
        JSON_OBJECT(
          'domain', domain,
          'text', recommendation_text,
          'generatedAt', DATE_FORMAT(generated_at, '%Y-%m-%d %H:%i:%s')
        )
      )
      FROM (
        SELECT domain, recommendation_text, generated_at
        FROM user_recommendations
        WHERE user_id = p_user_id
        ORDER BY generated_at DESC
        LIMIT 5
      ) recent_recommendations
    ), JSON_ARRAY())
  ) AS snapshot_payload;
END //

DROP TRIGGER IF EXISTS trg_attendance_record_bi //
CREATE TRIGGER trg_attendance_record_bi
BEFORE INSERT ON attendance_record
FOR EACH ROW
BEGIN
  DECLARE v_entry_subject_id VARCHAR(255);

  SET NEW.class_date = DATE(NEW.class_date);

  IF NEW.attended NOT IN (0, 1) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Attendance must be 0 or 1';
  END IF;

  IF NEW.class_date > CURDATE() THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Attendance cannot be marked for a future date';
  END IF;

  IF NEW.timetable_entry_id IS NOT NULL THEN
    SELECT subject_id
    INTO v_entry_subject_id
    FROM timetable_entry
    WHERE timetable_entry_id = NEW.timetable_entry_id
    LIMIT 1;

    IF v_entry_subject_id IS NOT NULL AND v_entry_subject_id <> NEW.subject_id THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Attendance subject does not match the timetable entry subject';
    END IF;
  END IF;
END //

DROP TRIGGER IF EXISTS trg_attendance_record_ai //
CREATE TRIGGER trg_attendance_record_ai
AFTER INSERT ON attendance_record
FOR EACH ROW
BEGIN
  DECLARE v_min_attendance DECIMAL(5,2) DEFAULT 75.00;
  DECLARE v_attendance_pct DECIMAL(5,2) DEFAULT 0.00;

  IF NEW.attended = 0 THEN
    SELECT COALESCE(minimum_attendance_percentage, 75)
    INTO v_min_attendance
    FROM subject
    WHERE subject_id = NEW.subject_id
    LIMIT 1;

    SET v_attendance_pct = fn_user_attendance_percentage(NEW.user_id, NEW.subject_id);

    INSERT INTO user_behavior_log (
      id,
      user_id,
      domain,
      entity_id,
      action,
      timestamp,
      day_of_week,
      hour_of_day,
      exam_week,
      attendance_pressure
    )
    VALUES (
      CONCAT('beh-acd-', NEW.attendance_id),
      NEW.user_id,
      'academic',
      NEW.attendance_id,
      'missed',
      CONCAT(NEW.class_date, ' 09:00:00'),
      MOD(DAYOFWEEK(NEW.class_date) + 5, 7),
      9,
      MONTH(NEW.class_date) IN (4, 11),
      v_attendance_pct < v_min_attendance
    )
    ON DUPLICATE KEY UPDATE
      timestamp = VALUES(timestamp),
      attendance_pressure = VALUES(attendance_pressure);
  END IF;
END //

DROP TRIGGER IF EXISTS trg_marks_record_bi //
CREATE TRIGGER trg_marks_record_bi
BEFORE INSERT ON marks_record
FOR EACH ROW
BEGIN
  SET NEW.component_type = LOWER(TRIM(NEW.component_type));

  IF NEW.max_score IS NULL OR NEW.max_score <= 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'max_score must be greater than 0';
  END IF;

  IF NEW.score IS NULL OR NEW.score < 0 OR NEW.score > NEW.max_score THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'score must be between 0 and max_score';
  END IF;
END //

DROP TRIGGER IF EXISTS trg_marks_record_bu //
CREATE TRIGGER trg_marks_record_bu
BEFORE UPDATE ON marks_record
FOR EACH ROW
BEGIN
  SET NEW.component_type = LOWER(TRIM(NEW.component_type));

  IF NEW.max_score IS NULL OR NEW.max_score <= 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'max_score must be greater than 0';
  END IF;

  IF NEW.score IS NULL OR NEW.score < 0 OR NEW.score > NEW.max_score THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'score must be between 0 and max_score';
  END IF;
END //

DROP TRIGGER IF EXISTS trg_workout_action_bi //
CREATE TRIGGER trg_workout_action_bi
BEFORE INSERT ON workout_action
FOR EACH ROW
BEGIN
  DECLARE v_session_owner VARCHAR(255);

  SET NEW.status = LOWER(TRIM(NEW.status));

  IF NEW.performed_at IS NULL THEN
    SET NEW.performed_at = CURRENT_TIMESTAMP;
  END IF;

  IF NEW.status = 'completed' THEN
    SET NEW.status = 'done';
  END IF;

  IF NEW.status NOT IN ('done', 'skipped') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Workout status must be done, completed, or skipped';
  END IF;

  SELECT user_id
  INTO v_session_owner
  FROM workout_session
  WHERE session_id = NEW.session_id
  LIMIT 1;

  IF v_session_owner IS NULL OR v_session_owner <> NEW.user_id THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Workout action user does not match the workout session owner';
  END IF;
END //

DROP TRIGGER IF EXISTS trg_workout_action_ai //
CREATE TRIGGER trg_workout_action_ai
AFTER INSERT ON workout_action
FOR EACH ROW
BEGIN
  INSERT INTO user_behavior_log (
    id,
    user_id,
    domain,
    entity_id,
    action,
    timestamp,
    day_of_week,
    hour_of_day,
    exam_week,
    attendance_pressure
  )
  VALUES (
    CONCAT('beh-fit-', NEW.action_id),
    NEW.user_id,
    'fitness',
    NEW.session_id,
    NEW.status,
    NEW.performed_at,
    MOD(DAYOFWEEK(NEW.performed_at) + 5, 7),
    HOUR(NEW.performed_at),
    MONTH(NEW.performed_at) IN (4, 11),
    FALSE
  )
  ON DUPLICATE KEY UPDATE
    timestamp = VALUES(timestamp);
END //

DROP TRIGGER IF EXISTS trg_food_image_ai //
CREATE TRIGGER trg_food_image_ai
AFTER INSERT ON food_image
FOR EACH ROW
BEGIN
  INSERT INTO user_behavior_log (
    id,
    user_id,
    domain,
    entity_id,
    action,
    timestamp,
    day_of_week,
    hour_of_day,
    exam_week,
    attendance_pressure
  )
  VALUES (
    CONCAT('beh-nut-', NEW.image_id),
    NEW.user_id,
    'nutrition',
    NEW.image_id,
    'submitted',
    NEW.uploaded_at,
    MOD(DAYOFWEEK(NEW.uploaded_at) + 5, 7),
    HOUR(NEW.uploaded_at),
    MONTH(NEW.uploaded_at) IN (4, 11),
    FALSE
  )
  ON DUPLICATE KEY UPDATE
    timestamp = VALUES(timestamp);
END //

DROP TRIGGER IF EXISTS trg_confirmed_food_item_ai //
CREATE TRIGGER trg_confirmed_food_item_ai
AFTER INSERT ON confirmed_food_item
FOR EACH ROW
BEGIN
  DECLARE v_image_id VARCHAR(255);

  SELECT image_id
  INTO v_image_id
  FROM detected_food_item
  WHERE detected_id = NEW.detected_id
  LIMIT 1;

  IF v_image_id IS NOT NULL THEN
    CALL sp_refresh_food_log_for_image(v_image_id);
  END IF;
END //

DROP TRIGGER IF EXISTS trg_confirmed_food_item_au //
CREATE TRIGGER trg_confirmed_food_item_au
AFTER UPDATE ON confirmed_food_item
FOR EACH ROW
BEGIN
  DECLARE v_image_id VARCHAR(255);

  SELECT image_id
  INTO v_image_id
  FROM detected_food_item
  WHERE detected_id = NEW.detected_id
  LIMIT 1;

  IF v_image_id IS NOT NULL THEN
    CALL sp_refresh_food_log_for_image(v_image_id);
  END IF;
END //

DROP TRIGGER IF EXISTS trg_confirmed_food_item_ad //
CREATE TRIGGER trg_confirmed_food_item_ad
AFTER DELETE ON confirmed_food_item
FOR EACH ROW
BEGIN
  DECLARE v_image_id VARCHAR(255);

  SELECT image_id
  INTO v_image_id
  FROM detected_food_item
  WHERE detected_id = OLD.detected_id
  LIMIT 1;

  IF v_image_id IS NOT NULL THEN
    CALL sp_refresh_food_log_for_image(v_image_id);
  END IF;
END //

DELIMITER ;
