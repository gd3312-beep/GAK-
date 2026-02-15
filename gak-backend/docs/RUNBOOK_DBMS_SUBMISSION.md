# Runbook: End-to-End DBMS Demo

## 1) Start MySQL server
- macOS (Homebrew): `brew services start mysql`

## 2) Apply all SQL files (`01`..`09` + `views.sql`)
```bash
cd gak-backend
npm run db:bootstrap
```
By default, this resets `GAK` first (`DB_RESET=true`) for clean reproducibility.

Manual equivalent:
```bash
mysql -uroot -proot -e "DROP DATABASE IF EXISTS GAK;"
mysql -uroot -proot < sql/01_schema.sql
mysql -uroot -proot < sql/02_constraints.sql
mysql -uroot -proot < sql/05_advanced_features.sql
mysql -uroot -proot < sql/07_academia_integration.sql
mysql -uroot -proot < sql/08_fit_daily_metric.sql
mysql -uroot -proot < sql/09_workout_plan_details.sql
mysql -uroot -proot < sql/views.sql
mysql -uroot -proot < sql/03_sample_data.sql
mysql -uroot -proot < sql/06_advanced_sample_data.sql
mysql -uroot -proot < sql/04_run_demo_queries.sql
```

## 3) Run demo queries
```bash
mysql -uroot -proot < sql/04_run_demo_queries.sql
```

## 4) Start backend
```bash
npm install
npm run dev
```

## 5) Start frontend
```bash
cd ../Frontend
npm install
npm run dev
```

## 6) Minimal API walkthrough
- Register: `POST /api/users/register`
- Login: `POST /api/users/login`
- Attendance summary: `GET /api/academic/attendance/summary/USER001`
- Performance: `GET /api/academic/performance/USER001`
- Fitness summary: `GET /api/fitness/summary/USER001`
- Daily nutrition: `GET /api/nutrition/food/daily/USER001?date=2026-01-10`
- Behavior timeline: `GET /api/behavior/timeline`
- Recompute metrics + recommendations: `POST /api/advanced-analytics/behavior-summary/recompute`
- Job run (manual): `POST /api/jobs/run-all`

## 7) Capture submission evidence
- `SHOW CREATE VIEW Student_Attendance_View;`
- `SELECT * FROM Student_Attendance_View WHERE user_id='USER001';`
- `SELECT * FROM Student_Performance_View WHERE user_id='USER001';`
- `SELECT * FROM Daily_Nutrition_View WHERE user_id='USER001';`
- Screenshots of output for report appendix.

## 8) Backup and restore (MySQL)
```bash
cd gak-backend
npm run db:backup -- ./backups
npm run db:restore -- ./backups/<file>.sql
```
