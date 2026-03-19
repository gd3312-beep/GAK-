USE GAK;

-- Optional advanced demo data for USER001
INSERT INTO calendar_event (event_id, user_id, event_date, event_type, title, google_event_id, sync_status)
VALUES ('CE001', 'USER001', '2026-01-20', 'academic', 'DBMS Internal Exam', NULL, 'pending')
ON DUPLICATE KEY UPDATE title = VALUES(title);

INSERT INTO email_event (id, user_id, subject, parsed_deadline, source, confidence_score)
VALUES
  ('EE001', 'USER001', 'NPTEL Assignment 3 Submission Deadline', '2026-01-25 23:59:00', 'gmail', 0.92)
ON DUPLICATE KEY UPDATE subject = VALUES(subject), parsed_deadline = VALUES(parsed_deadline);

INSERT INTO user_behavior_log (id, user_id, domain, entity_id, action, timestamp, day_of_week, hour_of_day, exam_week, attendance_pressure)
VALUES
  ('BL001', 'USER001', 'fitness', 'WS001', 'done', '2026-01-10 06:00:00', 6, 6, FALSE, FALSE),
  ('BL002', 'USER001', 'fitness', 'WS002', 'skipped', '2026-01-11 06:00:00', 0, 6, FALSE, FALSE),
  ('BL003', 'USER001', 'academic', 'A003', 'missed', '2026-01-24 09:00:00', 6, 9, FALSE, TRUE),
  ('BL004', 'USER001', 'nutrition', 'IMG001', 'submitted', '2026-01-10 13:00:00', 6, 13, FALSE, FALSE)
ON DUPLICATE KEY UPDATE action = VALUES(action);

INSERT INTO fitness_behavior_metrics (user_id, skip_rate, consistency_score, best_time_slot, worst_day, exam_week_drop_percentage, last_updated)
VALUES ('USER001', 0.33, 2, 6, 0, 0, NOW())
ON DUPLICATE KEY UPDATE skip_rate = VALUES(skip_rate), consistency_score = VALUES(consistency_score), last_updated = NOW();

INSERT INTO academic_behavior_metrics (user_id, avg_attendance, risk_subject_count, exam_week_stress_index, goal_adherence_score, last_updated)
VALUES ('USER001', 0.60, 2, 0.80, 0.46, NOW())
ON DUPLICATE KEY UPDATE avg_attendance = VALUES(avg_attendance), risk_subject_count = VALUES(risk_subject_count), last_updated = NOW();

INSERT INTO nutrition_behavior_metrics (user_id, avg_daily_calories, over_limit_days, protein_deficit_ratio, logging_consistency, last_updated)
VALUES ('USER001', 455, 0, 1.00, 0.10, NOW())
ON DUPLICATE KEY UPDATE avg_daily_calories = VALUES(avg_daily_calories), protein_deficit_ratio = VALUES(protein_deficit_ratio), last_updated = NOW();

INSERT INTO user_behavior_summary (user_id, academic_score_index, fitness_discipline_index, nutrition_balance_index, overall_consistency_index, last_computed)
VALUES ('USER001', 46.0, 67.0, 0.0, 37.67, NOW())
ON DUPLICATE KEY UPDATE academic_score_index = VALUES(academic_score_index), fitness_discipline_index = VALUES(fitness_discipline_index), nutrition_balance_index = VALUES(nutrition_balance_index), overall_consistency_index = VALUES(overall_consistency_index), last_computed = NOW();

INSERT INTO user_recommendations (id, user_id, domain, recommendation_text, generated_at, acknowledged)
VALUES
('REC001', 'USER001', 'academic', 'Attendance is below 75%. Prioritize attendance-critical classes this week.', NOW(), FALSE),
('REC002', 'USER001', 'nutrition', 'Protein deficit is frequent. Add a high-protein meal in the first half of the day.', NOW(), FALSE)
ON DUPLICATE KEY UPDATE recommendation_text = VALUES(recommendation_text), generated_at = NOW();
