const pool = require("../config/db");

async function upsertDailyFitMetrics({ userId, metricDate, steps = null, calories = null, heartRateAvg = null }) {
  try {
    await pool.execute(
      `INSERT INTO fit_daily_metric
        (user_id, metric_date, steps, calories, heart_rate_avg)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        steps = VALUES(steps),
        calories = VALUES(calories),
        heart_rate_avg = VALUES(heart_rate_avg),
        updated_at = CURRENT_TIMESTAMP`,
      [userId, metricDate, steps, calories, heartRateAvg]
    );
  } catch (error) {
    // Allow the rest of the app to function even if this optional table hasn't been created yet.
    if (error && error.code === "ER_NO_SUCH_TABLE") {
      return;
    }
    throw error;
  }
}

async function getDailyFitMetrics(userId, metricDate) {
  try {
    const [rows] = await pool.execute(
      `SELECT user_id, metric_date, steps, calories, heart_rate_avg, created_at, updated_at
       FROM fit_daily_metric
       WHERE user_id = ? AND metric_date = ?`,
      [userId, metricDate]
    );

    return rows[0] || null;
  } catch (error) {
    if (error && error.code === "ER_NO_SUCH_TABLE") {
      return null;
    }
    throw error;
  }
}

async function listFitMetricsRange(userId, fromDate) {
  try {
    const [rows] = await pool.execute(
      `SELECT metric_date, steps, calories
       FROM fit_daily_metric
       WHERE user_id = ? AND metric_date >= ?
       ORDER BY metric_date ASC`,
      [userId, fromDate]
    );

    return rows;
  } catch (error) {
    if (error && error.code === "ER_NO_SUCH_TABLE") {
      return [];
    }
    throw error;
  }
}

module.exports = {
  upsertDailyFitMetrics,
  getDailyFitMetrics,
  listFitMetricsRange
};
