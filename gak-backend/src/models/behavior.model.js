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
  upsertBehaviorSummary,
  replaceRecommendations,
  getBehaviorSummary
};
