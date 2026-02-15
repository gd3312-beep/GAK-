# Output Capture Template (Paste Results)

## Query 1: Derived Attendance Percentage
SQL:
```sql
SELECT ROUND(SUM(attended) / COUNT(*) * 100, 2) AS attendance_percentage
FROM attendance_record
WHERE user_id = 'USER001';
```
Output:
```
<PASTE RESULT>
```

## Query 2: Student_Attendance_View
SQL:
```sql
SELECT * FROM Student_Attendance_View WHERE user_id='USER001';
```
Output:
```
<PASTE RESULT>
```

## Query 3: Student_Performance_View
SQL:
```sql
SELECT * FROM Student_Performance_View WHERE user_id='USER001';
```
Output:
```
<PASTE RESULT>
```

## Query 4: Workout Completion Rate
SQL:
```sql
SELECT ROUND(COUNT(CASE WHEN LOWER(status) IN ('done','completed') THEN 1 END) / COUNT(*) * 100, 2) AS completion_rate
FROM workout_action
WHERE user_id='USER001';
```
Output:
```
<PASTE RESULT>
```

## Query 5: Daily_Nutrition_View
SQL:
```sql
SELECT * FROM Daily_Nutrition_View WHERE user_id='USER001';
```
Output:
```
<PASTE RESULT>
```

## Query 6: Behavior Timeline
SQL:
```sql
SELECT domain, action, timestamp FROM user_behavior_log
WHERE user_id='USER001'
ORDER BY timestamp DESC;
```
Output:
```
<PASTE RESULT>
```

## Query 7: Overall Consistency
SQL:
```sql
SELECT * FROM User_Consistency_View WHERE user_id='USER001';
```
Output:
```
<PASTE RESULT>
```
