# ER to Relational Mapping (GAK)

## Central Entity
- `app_user(user_id PK)`

## Academic Domain
- `subject(subject_id PK)`
- `timetable_entry(timetable_entry_id PK, section_id FK, subject_id)`
- `academic_profile(academic_profile_id PK, user_id FK, section_id FK, ...)`
- `attendance_record(attendance_id PK, user_id FK, subject_id FK, timetable_entry_id FK)`
- `marks_record(marks_id PK, user_id FK, subject_id FK)`

Cardinality:
- `app_user 1:N attendance_record`
- `app_user 1:N marks_record`
- `subject 1:N attendance_record`
- `subject 1:N marks_record`
- `section 1:N timetable_entry`

## Fitness Domain
- `workout_plan(plan_id PK, user_id FK)`
- `workout_session(session_id PK, plan_id FK, user_id FK)`
- `workout_action(action_id PK, session_id FK, user_id FK)`
- `activity_log(activity_id PK, user_id FK)`
- `body_metric(metric_id PK, user_id FK)`

Cardinality:
- `app_user 1:N workout_session`
- `workout_session 1:N workout_action`

## Nutrition Domain
- `food_image(image_id PK, user_id FK)`
- `detected_food_item(detected_id PK, image_id FK)`
- `confirmed_food_item(confirmed_id PK, detected_id FK)`
- `food_log(food_log_id PK, user_id FK)`

Cardinality:
- `app_user 1:N food_image`
- `food_image 1:N detected_food_item`
- `detected_food_item 1:N confirmed_food_item`

## Planning Domain
- `calendar_event(event_id PK, user_id FK)`
- `email_event(id PK, user_id FK)`

## Derived Attributes (not base-table stored)
- Attendance percentage
- Performance average
- Workout adherence rate
- Calories per minute
- BMI
- Daily macro totals

Implemented via SQL queries/views, not duplicated as columns.

## Behavior + Recommendation Domain
- `user_behavior_log(id PK, user_id FK, domain, action, timestamp, ...)`
- `fitness_behavior_metrics(user_id PK/FK)`
- `academic_behavior_metrics(user_id PK/FK)`
- `nutrition_behavior_metrics(user_id PK/FK)`
- `user_behavior_summary(user_id PK/FK)`
- `user_recommendations(id PK, user_id FK)`

Cardinality:
- `app_user 1:N user_behavior_log`
- `app_user 1:1 fitness_behavior_metrics`
- `app_user 1:1 academic_behavior_metrics`
- `app_user 1:1 nutrition_behavior_metrics`
- `app_user 1:1 user_behavior_summary`
- `app_user 1:N user_recommendations`
