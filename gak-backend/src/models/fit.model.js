const pool = require("../config/db");
const { createId } = require("../utils/id.util");

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

async function getLatestBodyMetric(userId) {
  try {
    const [rows] = await pool.execute(
      `SELECT metric_id, user_id, height, weight, body_fat_percentage, recorded_timestamp
       FROM body_metric
       WHERE user_id = ?
       ORDER BY recorded_timestamp DESC
       LIMIT 1`,
      [userId]
    );
    return rows[0] || null;
  } catch (error) {
    if (error && error.code === "ER_NO_SUCH_TABLE") {
      return null;
    }
    throw error;
  }
}

async function upsertLatestBodyMetric({ userId, height = null, weight = null, bodyFatPercentage = null }) {
  const normalizePositive = (value) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const incomingHeight = normalizePositive(height);
  const incomingWeight = normalizePositive(weight);
  const incomingBodyFat = bodyFatPercentage === null || bodyFatPercentage === undefined
    ? null
    : normalizePositive(bodyFatPercentage);
  const existing = await getLatestBodyMetric(userId);

  const finalHeight = incomingHeight ?? normalizePositive(existing?.height);
  const finalWeight = incomingWeight ?? normalizePositive(existing?.weight);
  const finalBodyFat = incomingBodyFat ?? normalizePositive(existing?.body_fat_percentage);

  if (finalHeight === null && finalWeight === null && finalBodyFat === null) {
    return { inserted: false, metric: existing || null };
  }

  const nearlyEqual = (a, b) => {
    if (a === null && b === null) return true;
    if (a === null || b === null) return false;
    return Math.abs(Number(a) - Number(b)) < 0.0001;
  };

  if (
    existing
    && nearlyEqual(finalHeight, normalizePositive(existing.height))
    && nearlyEqual(finalWeight, normalizePositive(existing.weight))
    && nearlyEqual(finalBodyFat, normalizePositive(existing.body_fat_percentage))
  ) {
    return { inserted: false, metric: existing };
  }

  try {
    const metricId = createId("bm");
    await pool.execute(
      `INSERT INTO body_metric
        (metric_id, user_id, height, weight, body_fat_percentage)
       VALUES (?, ?, ?, ?, ?)`,
      [metricId, userId, finalHeight, finalWeight, finalBodyFat]
    );
    const latest = await getLatestBodyMetric(userId);
    return { inserted: true, metric: latest || null };
  } catch (error) {
    if (error && error.code === "ER_NO_SUCH_TABLE") {
      return { inserted: false, metric: existing || null };
    }
    throw error;
  }
}

module.exports = {
  upsertDailyFitMetrics,
  getDailyFitMetrics,
  listFitMetricsRange,
  getLatestBodyMetric,
  upsertLatestBodyMetric
};
