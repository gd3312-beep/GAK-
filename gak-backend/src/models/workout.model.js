const pool = require("../config/db");

async function createWorkoutSession({
  sessionId,
  userId,
  workoutDate,
  workoutType,
  muscleGroup,
  durationMinutes = 30,
  caloriesBurned = 0,
  planId = null
}) {
  await pool.execute(
    `INSERT INTO workout_session
      (session_id, plan_id, user_id, workout_date, workout_type, muscle_group, duration_minutes, calories_burned)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [sessionId, planId, userId, workoutDate, workoutType, muscleGroup, durationMinutes, caloriesBurned]
  );

  return { sessionId, userId, workoutDate, workoutType, muscleGroup, durationMinutes, caloriesBurned };
}

async function sessionExists(sessionId) {
  const [rows] = await pool.execute(
    `SELECT session_id
     FROM workout_session
     WHERE session_id = ?`,
    [sessionId]
  );

  return rows.length > 0;
}

async function sessionExistsForUser(sessionId, userId) {
  const [rows] = await pool.execute(
    `SELECT session_id
     FROM workout_session
     WHERE session_id = ? AND user_id = ?`,
    [sessionId, userId]
  );

  return rows.length > 0;
}

async function upsertWorkoutAction({ actionId, sessionId, userId, status }) {
  const [existingRows] = await pool.execute(
    `SELECT action_id
     FROM workout_action
     WHERE session_id = ? AND user_id = ?
     LIMIT 1`,
    [sessionId, userId]
  );

  if (existingRows.length) {
    await pool.execute(
      `UPDATE workout_action
       SET status = ?, performed_at = CURRENT_TIMESTAMP
       WHERE action_id = ?`,
      [status, existingRows[0].action_id]
    );
    return existingRows[0].action_id;
  }

  await pool.execute(
    `INSERT INTO workout_action (action_id, session_id, user_id, status)
     VALUES (?, ?, ?, ?)`,
    [actionId, sessionId, userId, status]
  );

  return actionId;
}

async function getSessionByUserAndDate(userId, workoutDate) {
  const [rows] = await pool.execute(
    `SELECT session_id, plan_id, user_id, workout_date, workout_type, muscle_group, duration_minutes, calories_burned
     FROM workout_session
     WHERE user_id = ? AND workout_date = ?
     ORDER BY session_id DESC
     LIMIT 1`,
    [userId, workoutDate]
  );

  return rows[0] || null;
}

async function getActionForSession(userId, sessionId) {
  const [rows] = await pool.execute(
    `SELECT action_id, status, performed_at
     FROM workout_action
     WHERE user_id = ? AND session_id = ?
     LIMIT 1`,
    [userId, sessionId]
  );

  return rows[0] || null;
}

async function getWorkoutCompletionRate(userId) {
  const [rows] = await pool.execute(
    `SELECT
      COUNT(*) AS total_actions,
      SUM(CASE WHEN LOWER(status) IN ('done', 'completed') THEN 1 ELSE 0 END) AS completed_actions,
      ROUND(
        (SUM(CASE WHEN LOWER(status) IN ('done', 'completed') THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0)) * 100,
        2
      ) AS completion_rate
     FROM workout_action
     WHERE user_id = ?`,
    [userId]
  );

  return rows[0] || { total_actions: 0, completed_actions: 0, completion_rate: 0 };
}

async function getCaloriesPerMinute(userId) {
  const [rows] = await pool.execute(
    `SELECT
      ROUND(SUM(calories_burned) / NULLIF(SUM(duration), 0), 2) AS calories_per_minute
     FROM activity_log
     WHERE user_id = ?`,
    [userId]
  );

  return rows[0] || { calories_per_minute: null };
}

async function getLatestBodyMetric(userId) {
  const [rows] = await pool.execute(
    `SELECT height, weight
     FROM body_metric
     WHERE user_id = ?
     ORDER BY recorded_timestamp DESC
     LIMIT 1`,
    [userId]
  );

  return rows[0] || null;
}

module.exports = {
  createWorkoutSession,
  sessionExists,
  sessionExistsForUser,
  upsertWorkoutAction,
  getSessionByUserAndDate,
  getActionForSession,
  getWorkoutCompletionRate,
  getCaloriesPerMinute,
  getLatestBodyMetric
};
