USE GAK;

SET @uid = 'USER001';

-- 1) Derived attendance percentage
SELECT
  @uid AS user_id,
  ROUND(SUM(attended) / COUNT(*) * 100, 2) AS attendance_percentage
FROM attendance_record
WHERE user_id = @uid;

-- 2) View: subject-wise attendance
SELECT *
FROM Student_Attendance_View
WHERE user_id = @uid;

-- 3) View: subject-wise performance
SELECT *
FROM Student_Performance_View
WHERE user_id = @uid
ORDER BY average_percentage DESC;

-- 4) Workout adherence rate
SELECT
  @uid AS user_id,
  ROUND(COUNT(CASE WHEN LOWER(status) IN ('done', 'completed') THEN 1 END) / COUNT(*) * 100, 2) AS completion_rate
FROM workout_action
WHERE user_id = @uid;

-- 5) Monthly attendance trend
SELECT
  DATE_FORMAT(class_date, '%Y-%m') AS month,
  COUNT(*) AS total_classes,
  SUM(attended) AS attended_classes,
  ROUND((SUM(attended) / COUNT(*)) * 100, 2) AS attendance_percentage
FROM attendance_record
WHERE user_id = @uid
GROUP BY DATE_FORMAT(class_date, '%Y-%m')
ORDER BY month;

-- 6) View: daily nutrition
SELECT *
FROM Daily_Nutrition_View
WHERE user_id = @uid
ORDER BY log_date;

-- 7) Behavior timeline snapshot
SELECT domain, action, timestamp, day_of_week, hour_of_day
FROM user_behavior_log
WHERE user_id = @uid
ORDER BY timestamp DESC
LIMIT 20;

-- 8) Derived consistency summary
SELECT *
FROM User_Consistency_View
WHERE user_id = @uid;

-- 9) Latest recommendations
SELECT domain, recommendation_text, generated_at
FROM user_recommendations
WHERE user_id = @uid
ORDER BY generated_at DESC
LIMIT 10;
