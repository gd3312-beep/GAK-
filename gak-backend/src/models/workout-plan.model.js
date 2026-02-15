const pool = require("../config/db");

async function createWorkoutPlan({ planId, userId, source, planName = null, startTime = null, endTime = null, filePath = null }) {
  await pool.execute(
    `INSERT INTO workout_plan (plan_id, user_id, source, plan_name, schedule_start_time, schedule_end_time, file_path)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [planId, userId, source, planName, startTime, endTime, filePath]
  );

  return { planId, userId, source, planName, startTime, endTime, filePath };
}

async function getLatestWorkoutPlan(userId) {
  const [rows] = await pool.execute(
    `SELECT plan_id, user_id, source, plan_name, schedule_start_time, schedule_end_time, file_path, created_at
     FROM workout_plan
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );

  return rows[0] || null;
}

async function clearPlanExercises(planId) {
  await pool.execute(`DELETE FROM workout_plan_exercise WHERE plan_id = ?`, [planId]);
}

async function insertPlanExercises(planId, exercises) {
  if (!Array.isArray(exercises) || exercises.length === 0) return;

  for (const ex of exercises) {
    await pool.execute(
      `INSERT INTO workout_plan_exercise
        (exercise_id, plan_id, day_label, sort_order, exercise_name, set_count, reps)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        ex.exerciseId,
        planId,
        ex.dayLabel || null,
        Number(ex.sortOrder || 0),
        ex.exerciseName,
        ex.sets === undefined || ex.sets === null ? null : Number(ex.sets),
        ex.reps || null
      ]
    );
  }
}

async function listPlanExercises(planId) {
  const [rows] = await pool.execute(
    `SELECT exercise_id, day_label, sort_order, exercise_name, set_count AS \`sets\`, reps
     FROM workout_plan_exercise
     WHERE plan_id = ?
     ORDER BY sort_order ASC, exercise_name ASC`,
    [planId]
  );

  return rows;
}

module.exports = {
  createWorkoutPlan,
  getLatestWorkoutPlan,
  clearPlanExercises,
  insertPlanExercises,
  listPlanExercises
};
