# Normalization Notes (DBMS Viva)

## 1NF
- All tables have atomic attributes.
- No repeating groups (e.g., food items are separate rows in `detected_food_item` and `confirmed_food_item`).

## 2NF
- Non-key attributes depend on full primary key.
- Example: in `marks_record`, `score` and `max_score` depend on `marks_id`.

## 3NF
- Transitive dependencies are minimized by separating master entities.
- Example:
  - University/campus/unit/section split into separate tables.
  - Subject details stored once in `subject`, referenced by attendance and marks.

## Referential Integrity
- Foreign keys enforce valid parent-child relationships.
- Backend also validates references before insert for user-friendly errors.

## Controlled Redundancy
- No duplicate subject names in transactional tables.
- Aggregates are computed using views (`Student_Attendance_View`, `Student_Performance_View`, `Daily_Nutrition_View`).
- If `food_log.total_calories` is used, it is treated as a cache/materialized aggregate and can be recomputed.
