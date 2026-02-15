USE GAK;

-- Email should be unique for authentication.
ALTER TABLE app_user
  ADD CONSTRAINT uq_app_user_email UNIQUE (email);

-- Prevent invalid attendance and marks ranges.
ALTER TABLE attendance_record
  ADD CONSTRAINT chk_attendance_attended CHECK (attended IN (0, 1));

ALTER TABLE marks_record
  ADD CONSTRAINT chk_marks_score_non_negative CHECK (score >= 0),
  ADD CONSTRAINT chk_marks_max_positive CHECK (max_score > 0),
  ADD CONSTRAINT chk_marks_score_within_max CHECK (score <= max_score);

ALTER TABLE confirmed_food_item
  ADD CONSTRAINT chk_food_quantity_positive CHECK (quantity > 0),
  ADD CONSTRAINT chk_food_calories_non_negative CHECK (calories >= 0),
  ADD CONSTRAINT chk_food_macros_non_negative CHECK (protein >= 0 AND carbs >= 0 AND fats >= 0);

ALTER TABLE workout_action
  ADD CONSTRAINT chk_workout_status CHECK (LOWER(status) IN ('done', 'completed', 'skipped'));

-- Useful indexes for reporting queries.
CREATE INDEX idx_attendance_user_subject_date ON attendance_record (user_id, subject_id, class_date);
CREATE INDEX idx_marks_user_subject ON marks_record (user_id, subject_id);
CREATE INDEX idx_workout_action_user_time ON workout_action (user_id, performed_at);
CREATE INDEX idx_food_image_user_date ON food_image (user_id, uploaded_at);
