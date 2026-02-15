-- DBMS reporting views for GAK
USE GAK;

CREATE OR REPLACE VIEW Student_Attendance_View AS
SELECT
  a.user_id,
  s.subject_id,
  s.subject_name,
  COUNT(*) AS total_classes,
  SUM(a.attended) AS attended_classes,
  ROUND((SUM(a.attended) / COUNT(*)) * 100, 2) AS attendance_percentage
FROM attendance_record a
JOIN subject s ON a.subject_id = s.subject_id
GROUP BY a.user_id, s.subject_id, s.subject_name;

CREATE OR REPLACE VIEW Student_Performance_View AS
SELECT
  m.user_id,
  s.subject_id,
  s.subject_name,
  ROUND(AVG((m.score / NULLIF(m.max_score, 0)) * 100), 2) AS average_percentage,
  COUNT(*) AS components_count
FROM marks_record m
JOIN subject s ON m.subject_id = s.subject_id
GROUP BY m.user_id, s.subject_id, s.subject_name;

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
