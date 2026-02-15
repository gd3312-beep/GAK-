-- 1) Derived attendance percentage (dynamic, not stored)
SELECT
  SUM(attended) / COUNT(*) * 100 AS attendance_percentage
FROM attendance_record
WHERE user_id = ?;

-- 2) Subject-wise attendance report
SELECT *
FROM Student_Attendance_View
WHERE user_id = ?;

-- 3) Subject performance report
SELECT *
FROM Student_Performance_View
WHERE user_id = ?
ORDER BY average_percentage DESC;

-- 4) Workout adherence rate (grouped metric)
SELECT
  COUNT(CASE WHEN LOWER(status) IN ('done', 'completed') THEN 1 END) / COUNT(*) * 100 AS completion_rate
FROM workout_action
WHERE user_id = ?;

-- 5) Monthly attendance trend
SELECT
  DATE_FORMAT(class_date, '%Y-%m') AS month,
  COUNT(*) AS total_classes,
  SUM(attended) AS attended_classes,
  ROUND((SUM(attended) / COUNT(*)) * 100, 2) AS attendance_percentage
FROM attendance_record
WHERE user_id = ?
GROUP BY DATE_FORMAT(class_date, '%Y-%m')
ORDER BY month;
