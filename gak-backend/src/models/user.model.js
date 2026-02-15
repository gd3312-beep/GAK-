const pool = require("../config/db");

const OPTIONAL_TABLE_ERRORS = new Set(["ER_NO_SUCH_TABLE", "ER_BAD_FIELD_ERROR"]);

async function safeExecute(connection, sql, params = []) {
  try {
    return await connection.execute(sql, params);
  } catch (error) {
    if (OPTIONAL_TABLE_ERRORS.has(error.code)) {
      return [[]];
    }
    throw error;
  }
}

async function safeRows(connection, sql, params = []) {
  const [rows] = await safeExecute(connection, sql, params);
  return Array.isArray(rows) ? rows : [];
}

async function findByEmail(email) {
  const [rows] = await pool.execute(
    `SELECT user_id, full_name, email, password_hash, created_at
     FROM app_user
     WHERE LOWER(email) = LOWER(?)`,
    [email]
  );

  return rows[0] || null;
}

async function createUser({ userId, fullName, email, passwordHash }) {
  await pool.execute(
    `INSERT INTO app_user (user_id, full_name, email, password_hash)
     VALUES (?, ?, ?, ?)`,
    [userId, fullName, String(email).toLowerCase(), passwordHash]
  );

  return { userId, fullName, email };
}

async function findById(userId) {
  const [rows] = await pool.execute(
    `SELECT user_id, full_name, email, created_at
     FROM app_user
     WHERE user_id = ?`,
    [userId]
  );

  return rows[0] || null;
}

async function findAuthById(userId) {
  const [rows] = await pool.execute(
    `SELECT user_id, email, password_hash
     FROM app_user
     WHERE user_id = ?`,
    [userId]
  );

  return rows[0] || null;
}

async function exportUserData(userId) {
  const connection = await pool.getConnection();
  try {
    const [
      profile,
      academicProfile,
      attendance,
      marks,
      goals,
      workoutPlans,
      workoutExercises,
      workoutSessions,
      workoutActions,
      activities,
      bodyMetrics,
      foodImages,
      detectedFoods,
      confirmedFoods,
      foodLogs,
      calendarEvents,
      emailEvents,
      googleAccounts,
      behaviorLog,
      recommendations,
      fitDaily,
      academiaAccount,
      academiaTimetable,
      academiaMarks,
      academiaAttendance
    ] = await Promise.all([
      safeRows(connection, `SELECT user_id, full_name, email, created_at FROM app_user WHERE user_id = ?`, [userId]),
      safeRows(connection, `SELECT * FROM academic_profile WHERE user_id = ?`, [userId]),
      safeRows(connection, `SELECT * FROM attendance_record WHERE user_id = ? ORDER BY class_date DESC`, [userId]),
      safeRows(connection, `SELECT * FROM marks_record WHERE user_id = ? ORDER BY recorded_at DESC`, [userId]),
      safeRows(connection, `SELECT * FROM academic_goal WHERE user_id = ? ORDER BY deadline_date ASC`, [userId]),
      safeRows(connection, `SELECT * FROM workout_plan WHERE user_id = ? ORDER BY created_at DESC`, [userId]),
      safeRows(
        connection,
        `SELECT wpe.*
         FROM workout_plan_exercise wpe
         JOIN workout_plan wp ON wp.plan_id = wpe.plan_id
         WHERE wp.user_id = ?
         ORDER BY wpe.sort_order ASC`,
        [userId]
      ),
      safeRows(connection, `SELECT * FROM workout_session WHERE user_id = ? ORDER BY workout_date DESC`, [userId]),
      safeRows(connection, `SELECT * FROM workout_action WHERE user_id = ? ORDER BY performed_at DESC`, [userId]),
      safeRows(connection, `SELECT * FROM activity_log WHERE user_id = ? ORDER BY start_time DESC`, [userId]),
      safeRows(connection, `SELECT * FROM body_metric WHERE user_id = ? ORDER BY recorded_timestamp DESC`, [userId]),
      safeRows(connection, `SELECT * FROM food_image WHERE user_id = ? ORDER BY uploaded_at DESC`, [userId]),
      safeRows(
        connection,
        `SELECT dfi.*
         FROM detected_food_item dfi
         JOIN food_image fi ON fi.image_id = dfi.image_id
         WHERE fi.user_id = ?`,
        [userId]
      ),
      safeRows(
        connection,
        `SELECT cfi.*
         FROM confirmed_food_item cfi
         JOIN detected_food_item dfi ON dfi.detected_id = cfi.detected_id
         JOIN food_image fi ON fi.image_id = dfi.image_id
         WHERE fi.user_id = ?`,
        [userId]
      ),
      safeRows(connection, `SELECT * FROM food_log WHERE user_id = ? ORDER BY log_date DESC`, [userId]),
      safeRows(connection, `SELECT * FROM calendar_event WHERE user_id = ? ORDER BY event_date ASC`, [userId]),
      safeRows(connection, `SELECT * FROM email_event WHERE user_id = ? ORDER BY created_at DESC`, [userId]),
      safeRows(connection, `SELECT * FROM google_account WHERE user_id = ? ORDER BY is_primary DESC, updated_at DESC`, [userId]),
      safeRows(connection, `SELECT * FROM user_behavior_log WHERE user_id = ? ORDER BY timestamp DESC`, [userId]),
      safeRows(connection, `SELECT * FROM user_recommendations WHERE user_id = ? ORDER BY generated_at DESC`, [userId]),
      safeRows(connection, `SELECT * FROM fit_daily_metric WHERE user_id = ? ORDER BY metric_date DESC`, [userId]),
      safeRows(connection, `SELECT * FROM academia_account WHERE user_id = ?`, [userId]),
      safeRows(connection, `SELECT * FROM academia_timetable_cache WHERE user_id = ?`, [userId]),
      safeRows(connection, `SELECT * FROM academia_marks_cache WHERE user_id = ?`, [userId]),
      safeRows(connection, `SELECT * FROM academia_attendance_cache WHERE user_id = ?`, [userId])
    ]);

    return {
      exportedAt: new Date().toISOString(),
      userId,
      profile: profile[0] || null,
      datasets: {
        academicProfile,
        attendance,
        marks,
        goals,
        workoutPlans,
        workoutExercises,
        workoutSessions,
        workoutActions,
        activities,
        bodyMetrics,
        foodImages,
        detectedFoods,
        confirmedFoods,
        foodLogs,
        calendarEvents,
        emailEvents,
        googleAccounts,
        behaviorLog,
        recommendations,
        fitDaily,
        academiaAccount,
        academiaTimetable,
        academiaMarks,
        academiaAttendance
      }
    };
  } finally {
    connection.release();
  }
}

async function deleteUserData(userId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await safeExecute(
      connection,
      `DELETE cfi
       FROM confirmed_food_item cfi
       JOIN detected_food_item dfi ON dfi.detected_id = cfi.detected_id
       JOIN food_image fi ON fi.image_id = dfi.image_id
       WHERE fi.user_id = ?`,
      [userId]
    );
    await safeExecute(
      connection,
      `DELETE dfi
       FROM detected_food_item dfi
       JOIN food_image fi ON fi.image_id = dfi.image_id
       WHERE fi.user_id = ?`,
      [userId]
    );
    await safeExecute(connection, `DELETE FROM food_image WHERE user_id = ?`, [userId]);

    await safeExecute(connection, `DELETE FROM workout_action WHERE user_id = ?`, [userId]);
    await safeExecute(connection, `DELETE FROM workout_session WHERE user_id = ?`, [userId]);
    await safeExecute(
      connection,
      `DELETE wpe
       FROM workout_plan_exercise wpe
       JOIN workout_plan wp ON wp.plan_id = wpe.plan_id
       WHERE wp.user_id = ?`,
      [userId]
    );
    await safeExecute(connection, `DELETE FROM workout_plan WHERE user_id = ?`, [userId]);

    await safeExecute(connection, `DELETE FROM user_behavior_log WHERE user_id = ?`, [userId]);
    await safeExecute(connection, `DELETE FROM user_recommendations WHERE user_id = ?`, [userId]);
    await safeExecute(connection, `DELETE FROM user_behavior_summary WHERE user_id = ?`, [userId]);
    await safeExecute(connection, `DELETE FROM fitness_behavior_metrics WHERE user_id = ?`, [userId]);
    await safeExecute(connection, `DELETE FROM academic_behavior_metrics WHERE user_id = ?`, [userId]);
    await safeExecute(connection, `DELETE FROM nutrition_behavior_metrics WHERE user_id = ?`, [userId]);

    await safeExecute(connection, `DELETE FROM academia_timetable_cache WHERE user_id = ?`, [userId]);
    await safeExecute(connection, `DELETE FROM academia_marks_cache WHERE user_id = ?`, [userId]);
    await safeExecute(connection, `DELETE FROM academia_attendance_cache WHERE user_id = ?`, [userId]);
    await safeExecute(connection, `DELETE FROM academia_account WHERE user_id = ?`, [userId]);

    await safeExecute(connection, `DELETE FROM fit_daily_metric WHERE user_id = ?`, [userId]);
    await safeExecute(connection, `DELETE FROM email_event WHERE user_id = ?`, [userId]);
    await safeExecute(connection, `DELETE FROM calendar_event WHERE user_id = ?`, [userId]);
    await safeExecute(connection, `DELETE FROM google_account WHERE user_id = ?`, [userId]);
    await safeExecute(connection, `DELETE FROM oauth_state_nonce WHERE user_id = ?`, [userId]);
    await safeExecute(connection, `DELETE FROM integration_status WHERE user_id = ?`, [userId]);
    await safeExecute(connection, `DELETE FROM food_log WHERE user_id = ?`, [userId]);
    await safeExecute(connection, `DELETE FROM body_metric WHERE user_id = ?`, [userId]);
    await safeExecute(connection, `DELETE FROM activity_log WHERE user_id = ?`, [userId]);
    await safeExecute(connection, `DELETE FROM academic_goal WHERE user_id = ?`, [userId]);
    await safeExecute(connection, `DELETE FROM marks_record WHERE user_id = ?`, [userId]);
    await safeExecute(connection, `DELETE FROM attendance_record WHERE user_id = ?`, [userId]);
    await safeExecute(connection, `DELETE FROM academic_profile WHERE user_id = ?`, [userId]);

    await safeExecute(connection, `DELETE FROM app_user WHERE user_id = ?`, [userId]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  findByEmail,
  createUser,
  findById,
  findAuthById,
  exportUserData,
  deleteUserData
};
