-- DBMS reporting views for GAK
USE GAK;

-- Canonical, readable views used by backend read models.
CREATE OR REPLACE VIEW v_student_attendance_summary AS
SELECT
  a.user_id,
  s.subject_id,
  s.subject_name,
  COUNT(*) AS total_classes,
  SUM(a.attended) AS attended_classes,
  ROUND((SUM(a.attended) / NULLIF(COUNT(*), 0)) * 100, 2) AS attendance_percentage
FROM attendance_record a
JOIN subject s ON a.subject_id = s.subject_id
GROUP BY a.user_id, s.subject_id, s.subject_name;

CREATE OR REPLACE VIEW v_student_marks_component AS
SELECT
  m.marks_id,
  m.user_id,
  m.subject_id,
  s.subject_name,
  m.component_type,
  ROUND(m.score, 2) AS score,
  ROUND(m.max_score, 2) AS max_score,
  ROUND((m.score / NULLIF(m.max_score, 0)) * 100, 2) AS mark_ratio_pct,
  m.recorded_at
FROM marks_record m
JOIN subject s ON m.subject_id = s.subject_id;

CREATE OR REPLACE VIEW v_student_marks_summary AS
SELECT
  user_id,
  subject_id,
  subject_name,
  ROUND(AVG(mark_ratio_pct), 2) AS average_percentage,
  COUNT(*) AS components_count
FROM v_student_marks_component
WHERE mark_ratio_pct IS NOT NULL
GROUP BY user_id, subject_id, subject_name;

CREATE OR REPLACE VIEW v_student_timetable AS
SELECT
  ap.user_id,
  t.timetable_entry_id,
  t.section_id,
  t.day_order,
  NULL AS day_label,
  t.start_time,
  t.end_time,
  s.subject_id,
  s.subject_name,
  f.faculty_name,
  c.room_number,
  c.building_name
FROM academic_profile ap
JOIN timetable_entry t ON ap.section_id = t.section_id
JOIN subject s ON t.subject_id = s.subject_id
LEFT JOIN faculty f ON t.faculty_id = f.faculty_id
LEFT JOIN classroom c ON t.classroom_id = c.classroom_id;

CREATE OR REPLACE VIEW v_day_order_mapping AS
SELECT
  calendar_id AS mapping_id,
  academic_unit_id,
  date AS calendar_date,
  day_order,
  event_type,
  description,
  academic_year
FROM academic_calendar;

-- Backward-compatible view names used by older code/scripts.
CREATE OR REPLACE VIEW Student_Attendance_View AS
SELECT * FROM v_student_attendance_summary;

CREATE OR REPLACE VIEW Student_Performance_View AS
SELECT * FROM v_student_marks_summary;

CREATE OR REPLACE VIEW Daily_Nutrition_View AS
SELECT
  fi.user_id,
  DATE(fi.uploaded_at) AS log_date,
  ROUND(SUM(cfi.calories * cfi.quantity), 2) AS total_calories,
  ROUND(SUM(cfi.protein * cfi.quantity), 2) AS total_protein,
  ROUND(SUM(cfi.carbs * cfi.quantity), 2) AS total_carbs,
  ROUND(SUM(cfi.fats * cfi.quantity), 2) AS total_fats
FROM food_image fi
JOIN detected_food_item dfi ON fi.image_id = dfi.image_id
JOIN confirmed_food_item cfi ON dfi.detected_id = cfi.detected_id
GROUP BY fi.user_id, DATE(fi.uploaded_at);

CREATE OR REPLACE VIEW Fitness_Behavior_Trend_View AS
SELECT
  user_id,
  DATE(timestamp) AS log_date,
  SUM(CASE WHEN action = 'done' THEN 1 ELSE 0 END) AS done_count,
  SUM(CASE WHEN action = 'skipped' THEN 1 ELSE 0 END) AS skipped_count
FROM user_behavior_log
WHERE domain = 'fitness'
GROUP BY user_id, DATE(timestamp);

CREATE OR REPLACE VIEW User_Consistency_View AS
SELECT
  ubs.user_id,
  ubs.academic_score_index,
  ubs.fitness_discipline_index,
  ubs.nutrition_balance_index,
  ubs.overall_consistency_index,
  ubs.last_computed
FROM user_behavior_summary ubs;

CREATE OR REPLACE VIEW day_order_mapping AS
SELECT * FROM v_day_order_mapping;
