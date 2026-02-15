USE GAK;

-- Master academic hierarchy
INSERT INTO university (university_id, university_name)
VALUES ('U001', 'GAK University');

INSERT INTO campus (campus_id, campus_name, university_id)
VALUES ('C001', 'Main Campus', 'U001');

INSERT INTO academic_unit (academic_unit_id, unit_name, unit_type, description, campus_id, university_id)
VALUES ('AU001', 'School of Computing', 'Department', 'CSE Division', 'C001', 'U001');

INSERT INTO section (section_id, section_name, academic_year, semester, program, academic_unit_id)
VALUES ('SEC001', 'CSE-A', 2025, 5, 'BTech CSE', 'AU001');

INSERT INTO app_user (user_id, full_name, email, password_hash)
VALUES ('USER001', 'Vaishnav Student', 'vaishnav@example.com', '$2a$10$abcdefghijklmnopqrstuv');

-- Academic setup
INSERT INTO subject (subject_id, subject_name, credits, minimum_attendance_percentage, academic_unit_id, program, semester)
VALUES
  ('SUB001', 'Database Management Systems', 4, 75, 'AU001', 'BTech CSE', 5),
  ('SUB002', 'Computer Networks', 4, 75, 'AU001', 'BTech CSE', 5);

INSERT INTO unified_timetable (unified_timetable_id, academic_year, semester, batch, academic_unit_id, campus_id)
VALUES ('UT001', 2025, 5, '2023', 'AU001', 'C001');

INSERT INTO faculty (faculty_id, faculty_name, department)
VALUES ('FAC001', 'Dr. Rao', 'CSE');

INSERT INTO classroom (classroom_id, room_number, building_name)
VALUES ('ROOM001', 'B-204', 'Block B');

INSERT INTO timetable_entry (timetable_entry_id, unified_timetable_id, section_id, subject_id, faculty_id, classroom_id, day_order, start_time, end_time)
VALUES
  ('TT001', 'UT001', 'SEC001', 'SUB001', 'FAC001', 'ROOM001', 1, '09:00:00', '10:00:00'),
  ('TT002', 'UT001', 'SEC001', 'SUB002', 'FAC001', 'ROOM001', 2, '10:00:00', '11:00:00');

INSERT INTO academic_profile (academic_profile_id, user_id, university_id, campus_id, academic_unit_id, section_id, program, branch, admission_year, current_semester)
VALUES ('AP001', 'USER001', 'U001', 'C001', 'AU001', 'SEC001', 'BTech CSE', 'CSE', 2023, 5);

-- Attendance records (derived attendance percentage demo)
INSERT INTO attendance_record (attendance_id, user_id, subject_id, timetable_entry_id, class_date, attended)
VALUES
  ('A001', 'USER001', 'SUB001', 'TT001', '2026-01-10', 1),
  ('A002', 'USER001', 'SUB001', 'TT001', '2026-01-17', 1),
  ('A003', 'USER001', 'SUB001', 'TT001', '2026-01-24', 0),
  ('A004', 'USER001', 'SUB002', 'TT002', '2026-01-11', 1),
  ('A005', 'USER001', 'SUB002', 'TT002', '2026-01-18', 0);

-- Marks records (derived performance demo)
INSERT INTO marks_record (marks_id, user_id, subject_id, component_type, score, max_score)
VALUES
  ('M001', 'USER001', 'SUB001', 'internal_1', 34, 40),
  ('M002', 'USER001', 'SUB001', 'assignment_1', 18, 20),
  ('M003', 'USER001', 'SUB002', 'internal_1', 28, 40),
  ('M004', 'USER001', 'SUB002', 'assignment_1', 15, 20);

-- Fitness data
INSERT INTO workout_plan (plan_id, user_id, source)
VALUES ('WP001', 'USER001', 'manual');

INSERT INTO workout_session (session_id, plan_id, user_id, workout_date, workout_type, muscle_group)
VALUES
  ('WS001', 'WP001', 'USER001', '2026-01-10', 'strength', 'chest'),
  ('WS002', 'WP001', 'USER001', '2026-01-11', 'cardio', 'legs'),
  ('WS003', 'WP001', 'USER001', '2026-01-12', 'strength', 'back');

INSERT INTO workout_action (action_id, session_id, user_id, status)
VALUES
  ('WA001', 'WS001', 'USER001', 'done'),
  ('WA002', 'WS002', 'USER001', 'skipped'),
  ('WA003', 'WS003', 'USER001', 'completed');

INSERT INTO activity_log (activity_id, user_id, activity_type, calories_burned, duration, start_time, end_time, source)
VALUES
  ('ACT001', 'USER001', 'running', 280, 35, '2026-01-10 06:00:00', '2026-01-10 06:35:00', 'manual'),
  ('ACT002', 'USER001', 'cycling', 220, 30, '2026-01-12 06:00:00', '2026-01-12 06:30:00', 'manual');

INSERT INTO body_metric (metric_id, user_id, height, weight, body_fat_percentage)
VALUES ('BM001', 'USER001', 1.74, 72.0, 18.0);

-- Nutrition data
INSERT INTO food_image (image_id, user_id, image_url, uploaded_at)
VALUES ('IMG001', 'USER001', 'https://example.com/meal1.jpg', '2026-01-10 13:00:00');

INSERT INTO detected_food_item (detected_id, image_id, food_name, confidence_score)
VALUES
  ('DF001', 'IMG001', 'Rice', 0.95),
  ('DF002', 'IMG001', 'Paneer Curry', 0.91);

INSERT INTO confirmed_food_item (confirmed_id, detected_id, quantity, calories, protein, carbs, fats)
VALUES
  ('CF001', 'DF001', 1.5, 130, 2.5, 28, 0.3),
  ('CF002', 'DF002', 1.0, 260, 14, 10, 18);
