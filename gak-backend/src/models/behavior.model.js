const pool = require("../config/db");

async function insertBehaviorLog({ id, userId, domain, entityId, action, timestamp, dayOfWeek, hourOfDay, examWeek, attendancePressure }) {
  await pool.execute(
    `INSERT INTO user_behavior_log
      (id, user_id, domain, entity_id, action, timestamp, day_of_week, hour_of_day, exam_week, attendance_pressure)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, domain, entityId, action, timestamp, dayOfWeek, hourOfDay, examWeek ? 1 : 0, attendancePressure ? 1 : 0]
  );
}

async function getBehaviorTimeline(userId, limit = 200) {
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(1000, Number(limit))) : 200;
  const [rows] = await pool.execute(
    `SELECT id, domain, entity_id, action, timestamp, day_of_week, hour_of_day, exam_week, attendance_pressure
     FROM user_behavior_log
     WHERE user_id = ?
     ORDER BY timestamp DESC
     LIMIT ${safeLimit}`,
    [userId]
  );

  return rows;
}

async function getDomainLogs(userId, domain, fromDate) {
  const [rows] = await pool.execute(
    `SELECT action, day_of_week, hour_of_day, exam_week, timestamp
     FROM user_behavior_log
     WHERE user_id = ? AND domain = ? AND timestamp >= ?`,
    [userId, domain, fromDate]
  );

  return rows;
}

async function listAllUsers() {
  const [rows] = await pool.execute(`SELECT user_id FROM app_user`);
  return rows;
}

async function upsertFitnessMetrics({ userId, skipRate, consistencyScore, bestTimeSlot, worstDay, examWeekDropPercentage }) {
  await pool.execute(
    `INSERT INTO fitness_behavior_metrics
      (user_id, skip_rate, consistency_score, best_time_slot, worst_day, exam_week_drop_percentage, last_updated)
     VALUES (?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
      skip_rate = VALUES(skip_rate),
      consistency_score = VALUES(consistency_score),
      best_time_slot = VALUES(best_time_slot),
      worst_day = VALUES(worst_day),
      exam_week_drop_percentage = VALUES(exam_week_drop_percentage),
      last_updated = NOW()`,
    [userId, skipRate, consistencyScore, bestTimeSlot, worstDay, examWeekDropPercentage]
  );
}

async function upsertAcademicMetrics({ userId, avgAttendance, riskSubjectCount, examWeekStressIndex, goalAdherenceScore }) {
  await pool.execute(
    `INSERT INTO academic_behavior_metrics
      (user_id, avg_attendance, risk_subject_count, exam_week_stress_index, goal_adherence_score, last_updated)
     VALUES (?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
      avg_attendance = VALUES(avg_attendance),
      risk_subject_count = VALUES(risk_subject_count),
      exam_week_stress_index = VALUES(exam_week_stress_index),
      goal_adherence_score = VALUES(goal_adherence_score),
      last_updated = NOW()`,
    [userId, avgAttendance, riskSubjectCount, examWeekStressIndex, goalAdherenceScore]
  );
}

async function upsertNutritionMetrics({ userId, avgDailyCalories, overLimitDays, proteinDeficitRatio, loggingConsistency }) {
  await pool.execute(
    `INSERT INTO nutrition_behavior_metrics
      (user_id, avg_daily_calories, over_limit_days, protein_deficit_ratio, logging_consistency, last_updated)
     VALUES (?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
      avg_daily_calories = VALUES(avg_daily_calories),
      over_limit_days = VALUES(over_limit_days),
      protein_deficit_ratio = VALUES(protein_deficit_ratio),
      logging_consistency = VALUES(logging_consistency),
      last_updated = NOW()`,
    [userId, avgDailyCalories, overLimitDays, proteinDeficitRatio, loggingConsistency]
  );
}

async function getBaseAcademicStats(userId) {
  const [attendanceRows] = await pool.execute(
    `SELECT COUNT(*) AS total_classes, SUM(attended) AS attended_classes, COUNT(DISTINCT CASE WHEN attended = 0 THEN subject_id END) AS risk_subject_count
     FROM attendance_record
     WHERE user_id = ?`,
    [userId]
  );

  const [marksRows] = await pool.execute(
    `SELECT AVG(score / NULLIF(max_score, 0)) AS avg_mark_ratio
     FROM marks_record
     WHERE user_id = ?`,
    [userId]
  );

  return {
    attendance: attendanceRows[0],
    marks: marksRows[0]
  };
}

async function getDailyNutritionTotals(userId, fromDate) {
  const [rows] = await pool.execute(
    `SELECT
      DATE(fi.uploaded_at) AS log_date,
      SUM(cfi.calories * cfi.quantity) AS calories_total,
      SUM(cfi.protein * cfi.quantity) AS protein_total
     FROM food_image fi
     JOIN detected_food_item dfi ON fi.image_id = dfi.image_id
     JOIN confirmed_food_item cfi ON dfi.detected_id = cfi.detected_id
     WHERE fi.user_id = ? AND fi.uploaded_at >= ?
     GROUP BY DATE(fi.uploaded_at)`,
    [userId, fromDate]
  );

  return rows;
}

async function getMetricsForSummary(userId) {
  const [[fitness]] = await pool.execute(`SELECT * FROM fitness_behavior_metrics WHERE user_id = ?`, [userId]);
  const [[academic]] = await pool.execute(`SELECT * FROM academic_behavior_metrics WHERE user_id = ?`, [userId]);
  const [[nutrition]] = await pool.execute(`SELECT * FROM nutrition_behavior_metrics WHERE user_id = ?`, [userId]);

  return { fitness, academic, nutrition };
}

async function listSubjectSignals(userId, sinceDate = null) {
  const hasWindow = Boolean(sinceDate);
  const attendanceFilter = hasWindow ? "AND class_date >= DATE(?)" : "";
  const marksFilter = hasWindow ? "AND recorded_at >= ?" : "";

  const params = hasWindow
    ? [userId, sinceDate, userId, sinceDate, userId, sinceDate, userId, sinceDate]
    : [userId, userId, userId, userId];

  const [rows] = await pool.execute(
    `WITH subject_ids AS (
      SELECT DISTINCT subject_id FROM attendance_record WHERE user_id = ? ${attendanceFilter}
      UNION
      SELECT DISTINCT subject_id FROM marks_record WHERE user_id = ? ${marksFilter}
    ),
    attendance AS (
      SELECT
        subject_id,
        ROUND((SUM(attended) / NULLIF(COUNT(*), 0)) * 100, 2) AS attendance_percentage,
        SUM(attended) AS attended_classes,
        COUNT(*) AS total_classes
      FROM attendance_record
      WHERE user_id = ? ${attendanceFilter}
      GROUP BY subject_id
    ),
    marks AS (
      SELECT
        subject_id,
        ROUND(AVG((score / NULLIF(max_score, 0)) * 100), 2) AS marks_percentage,
        COUNT(*) AS components_count
      FROM marks_record
      WHERE user_id = ? ${marksFilter}
      GROUP BY subject_id
    )
    SELECT
      sid.subject_id,
      COALESCE(s.subject_name, sid.subject_id) AS subject_name,
      a.attendance_percentage,
      a.attended_classes,
      a.total_classes,
      m.marks_percentage,
      m.components_count
    FROM subject_ids sid
    LEFT JOIN subject s ON s.subject_id = sid.subject_id
    LEFT JOIN attendance a ON a.subject_id = sid.subject_id
    LEFT JOIN marks m ON m.subject_id = sid.subject_id
    ORDER BY subject_name ASC`,
    params
  );

  return rows;
}

async function listUpcomingAcademicDeadlines(userId, limit = 6) {
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(20, Number(limit))) : 6;
  const [rows] = await pool.execute(
    `SELECT id, title, due_date, source
     FROM (
       SELECT
         event_id AS id,
         title,
         event_date AS due_date,
         'calendar' AS source
       FROM calendar_event
       WHERE user_id = ? AND event_type = 'academic' AND DATE(event_date) >= CURDATE()

       UNION ALL

       SELECT
         id,
         subject AS title,
         parsed_deadline AS due_date,
         'gmail' AS source
       FROM email_event
       WHERE user_id = ? AND parsed_deadline IS NOT NULL AND DATE(parsed_deadline) >= CURDATE()
     ) upcoming
     ORDER BY due_date ASC
     LIMIT ${safeLimit}`,
    [userId, userId]
  );

  return rows;
}

async function getTimetableLoadByDay(userId) {
  const [rows] = await pool.execute(
    `SELECT t.day_order, COUNT(*) AS class_count
     FROM academic_profile ap
     JOIN timetable_entry t ON t.section_id = ap.section_id
     WHERE ap.user_id = ?
     GROUP BY t.day_order
     ORDER BY t.day_order ASC`,
    [userId]
  );

  if (rows.length > 0) {
    return rows;
  }

  const [cacheRows] = await pool.execute(
    `SELECT day_order, COUNT(*) AS class_count
     FROM academia_timetable_cache
     WHERE user_id = ? AND day_order IS NOT NULL
     GROUP BY day_order
     ORDER BY day_order ASC`,
    [userId]
  );

  return cacheRows;
}

async function getRecentWorkoutSnapshot(userId, days = 21) {
  const hasWindow = days !== null && days !== undefined;
  const windowDays = hasWindow && Number.isFinite(Number(days)) ? Math.max(1, Math.min(365, Number(days))) : 21;
  const fromDate = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const [rows] = await pool.execute(
    `SELECT
      SUM(CASE WHEN LOWER(status) IN ('done', 'completed') THEN 1 ELSE 0 END) AS done_count,
      SUM(CASE WHEN LOWER(status) = 'skipped' THEN 1 ELSE 0 END) AS skipped_count,
      COUNT(*) AS total_actions
     FROM workout_action
     WHERE user_id = ?
     ${hasWindow ? "AND performed_at >= ?" : ""}`,
    hasWindow ? [userId, fromDate] : [userId]
  );

  return rows[0] || { done_count: 0, skipped_count: 0, total_actions: 0 };
}

async function getRecentAttendanceSnapshot(userId, days = 21) {
  const hasWindow = days !== null && days !== undefined;
  const windowDays = hasWindow && Number.isFinite(Number(days)) ? Math.max(1, Math.min(365, Number(days))) : 21;
  const fromDate = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const [rows] = await pool.execute(
    `SELECT
      SUM(CASE WHEN attended = 0 THEN 1 ELSE 0 END) AS missed_count,
      SUM(CASE WHEN attended = 1 THEN 1 ELSE 0 END) AS attended_count,
      COUNT(*) AS total_classes
     FROM attendance_record
     WHERE user_id = ?
     ${hasWindow ? "AND class_date >= DATE(?)" : ""}`,
    hasWindow ? [userId, fromDate] : [userId]
  );

  return rows[0] || { missed_count: 0, attended_count: 0, total_classes: 0 };
}

async function getRecentMarksTrend(userId, days = 30) {
  const hasWindow = days !== null && days !== undefined;
  if (hasWindow) {
    const windowDays = Number.isFinite(Number(days)) ? Math.max(7, Math.min(365, Number(days))) : 30;
    const sinceDate = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const midpoint = new Date(sinceDate.getTime() + (Date.now() - sinceDate.getTime()) / 2);
    const [rows] = await pool.execute(
      `SELECT
        AVG(CASE WHEN recorded_at >= ? THEN (score / NULLIF(max_score, 0)) END) AS recent_ratio,
        AVG(CASE WHEN recorded_at >= ? AND recorded_at < ? THEN (score / NULLIF(max_score, 0)) END) AS previous_ratio,
        SUM(CASE WHEN recorded_at >= ? THEN 1 ELSE 0 END) AS recent_components,
        COUNT(*) AS total_components
       FROM marks_record
       WHERE user_id = ? AND recorded_at >= ?`,
      [midpoint, sinceDate, midpoint, midpoint, userId, sinceDate]
    );

    return rows[0] || {
      recent_ratio: null,
      previous_ratio: null,
      recent_components: 0,
      total_components: 0
    };
  }

  const threshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [rows] = await pool.execute(
    `SELECT
      AVG(CASE WHEN recorded_at >= ? THEN (score / NULLIF(max_score, 0)) END) AS recent_ratio,
      AVG(CASE WHEN recorded_at < ? THEN (score / NULLIF(max_score, 0)) END) AS previous_ratio,
      SUM(CASE WHEN recorded_at >= ? THEN 1 ELSE 0 END) AS recent_components,
      COUNT(*) AS total_components
     FROM marks_record
     WHERE user_id = ?`,
    [threshold, threshold, threshold, userId]
  );

  return rows[0] || {
    recent_ratio: null,
    previous_ratio: null,
    recent_components: 0,
    total_components: 0
  };
}

async function getNutritionSnapshot(userId, days = 30) {
  const hasWindow = days !== null && days !== undefined;
  const windowDays = hasWindow && Number.isFinite(Number(days)) ? Math.max(1, Math.min(365, Number(days))) : 30;
  const fromDate = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const [rows] = await pool.execute(
    `SELECT
      COUNT(*) AS days_logged,
      ROUND(AVG(day_total.calories_total), 2) AS avg_daily_calories,
      SUM(CASE WHEN day_total.calories_total > 2400 THEN 1 ELSE 0 END) AS over_limit_days,
      ROUND((SUM(CASE WHEN day_total.protein_total < 60 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0)), 4) AS protein_deficit_ratio
     FROM (
      SELECT
        DATE(fi.uploaded_at) AS log_date,
        SUM(cfi.calories * cfi.quantity) AS calories_total,
        SUM(cfi.protein * cfi.quantity) AS protein_total
      FROM food_image fi
      JOIN detected_food_item dfi ON fi.image_id = dfi.image_id
      JOIN confirmed_food_item cfi ON dfi.detected_id = cfi.detected_id
      WHERE fi.user_id = ?
      ${hasWindow ? "AND fi.uploaded_at >= ?" : ""}
      GROUP BY DATE(fi.uploaded_at)
     ) day_total`,
    hasWindow ? [userId, fromDate] : [userId]
  );

  return rows[0] || {
    days_logged: 0,
    avg_daily_calories: 0,
    over_limit_days: 0,
    protein_deficit_ratio: 0
  };
}

async function getCohortRanks(userId) {
  const [rows] = await pool.execute(
    `WITH ranked AS (
      SELECT
        user_id,
        RANK() OVER (ORDER BY academic_score_index DESC) AS academic_rank,
        RANK() OVER (ORDER BY fitness_discipline_index DESC) AS fitness_rank,
        RANK() OVER (ORDER BY nutrition_balance_index DESC) AS nutrition_rank,
        RANK() OVER (ORDER BY overall_consistency_index DESC) AS overall_rank,
        COUNT(*) OVER () AS total_users
      FROM user_behavior_summary
    )
    SELECT
      user_id,
      academic_rank,
      fitness_rank,
      nutrition_rank,
      overall_rank,
      total_users
    FROM ranked
    WHERE user_id = ?`,
    [userId]
  );

  return rows[0] || null;
}

async function upsertBehaviorSummary({ userId, academicScoreIndex, fitnessDisciplineIndex, nutritionBalanceIndex, overallConsistencyIndex }) {
  await pool.execute(
    `INSERT INTO user_behavior_summary
      (user_id, academic_score_index, fitness_discipline_index, nutrition_balance_index, overall_consistency_index, last_computed)
     VALUES (?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
      academic_score_index = VALUES(academic_score_index),
      fitness_discipline_index = VALUES(fitness_discipline_index),
      nutrition_balance_index = VALUES(nutrition_balance_index),
      overall_consistency_index = VALUES(overall_consistency_index),
      last_computed = NOW()`,
    [userId, academicScoreIndex, fitnessDisciplineIndex, nutritionBalanceIndex, overallConsistencyIndex]
  );
}

async function replaceRecommendations(userId, recommendations) {
  await pool.execute(`DELETE FROM user_recommendations WHERE user_id = ? AND acknowledged = 0`, [userId]);

  for (const recommendation of recommendations) {
    await pool.execute(
      `INSERT INTO user_recommendations
        (id, user_id, domain, recommendation_text, generated_at, acknowledged)
       VALUES (?, ?, ?, ?, NOW(), 0)`,
      [recommendation.id, userId, recommendation.domain, recommendation.text]
    );
  }
}

async function getBehaviorSummary(userId) {
  const [[summary]] = await pool.execute(`SELECT * FROM user_behavior_summary WHERE user_id = ?`, [userId]);
  const [recommendations] = await pool.execute(
    `SELECT id, domain, recommendation_text, generated_at, acknowledged
     FROM user_recommendations
     WHERE user_id = ?
     ORDER BY generated_at DESC
     LIMIT 20`,
    [userId]
  );

  return { summary: summary || null, recommendations };
}

module.exports = {
  insertBehaviorLog,
  getBehaviorTimeline,
  getDomainLogs,
  listAllUsers,
  upsertFitnessMetrics,
  upsertAcademicMetrics,
  upsertNutritionMetrics,
  getBaseAcademicStats,
  getDailyNutritionTotals,
  getMetricsForSummary,
  listSubjectSignals,
  listUpcomingAcademicDeadlines,
  getTimetableLoadByDay,
  getRecentWorkoutSnapshot,
  getRecentAttendanceSnapshot,
  getRecentMarksTrend,
  getNutritionSnapshot,
  getCohortRanks,
  upsertBehaviorSummary,
  replaceRecommendations,
  getBehaviorSummary
};
