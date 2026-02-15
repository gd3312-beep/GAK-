const pool = require("../config/db");

async function saveGoogleTokens(userId, { googleId, accessToken, refreshToken, tokenExpiry }) {
  await pool.execute(
    `UPDATE app_user
     SET google_id = COALESCE(?, google_id),
         google_access_token = ?,
         google_refresh_token = COALESCE(?, google_refresh_token),
         google_token_expiry = COALESCE(?, google_token_expiry)
     WHERE user_id = ?`,
    [googleId || null, accessToken || null, refreshToken || null, tokenExpiry || null, userId]
  );
}

async function getUserGoogleTokens(userId) {
  const [rows] = await pool.execute(
    `SELECT user_id, google_id, google_access_token, google_refresh_token, google_token_expiry
     FROM app_user
     WHERE user_id = ?`,
    [userId]
  );

  return rows[0] || null;
}

async function listUsersWithRefreshToken() {
  const [rows] = await pool.execute(
    `SELECT user_id, google_access_token, google_refresh_token
     FROM app_user
     WHERE google_refresh_token IS NOT NULL`
  );

  return rows;
}

async function createCalendarEventRecord({ eventId, userId, eventDate, eventType, title, googleEventId = null, syncStatus = "pending" }) {
  await pool.execute(
    `INSERT INTO calendar_event
      (event_id, user_id, event_date, event_type, title, google_event_id, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [eventId, userId, eventDate, eventType, title, googleEventId, syncStatus]
  );
}

async function updateCalendarEventSync(eventId, { googleEventId, syncStatus }) {
  await pool.execute(
    `UPDATE calendar_event
     SET google_event_id = COALESCE(?, google_event_id),
         sync_status = ?
     WHERE event_id = ?`,
    [googleEventId || null, syncStatus, eventId]
  );
}

async function listPendingCalendarEvents() {
  const [rows] = await pool.execute(
    `SELECT event_id, user_id, event_date, event_type, title
     FROM calendar_event
     WHERE sync_status = 'pending'
     ORDER BY event_date ASC`
  );

  return rows;
}

async function getWorkoutSessionById(sessionId) {
  const [rows] = await pool.execute(
    `SELECT session_id, user_id, workout_date, workout_type, muscle_group, calories_burned, duration_minutes
     FROM workout_session
     WHERE session_id = ?`,
    [sessionId]
  );

  return rows[0] || null;
}

async function updateWorkoutGoogleSync(sessionId, { googleFitSessionId, syncStatus }) {
  await pool.execute(
    `UPDATE workout_session
     SET google_fit_session_id = ?, sync_status = ?
     WHERE session_id = ?`,
    [googleFitSessionId || null, syncStatus, sessionId]
  );
}

async function createEmailEvent({ id, userId, subject, parsedDeadline, confidenceScore }) {
  await pool.execute(
    `INSERT INTO email_event (id, user_id, subject, parsed_deadline, source, confidence_score)
     VALUES (?, ?, ?, ?, 'gmail', ?)`,
    [id, userId, subject, parsedDeadline || null, confidenceScore]
  );
}

async function listCalendarEventsByUser(userId) {
  const [rows] = await pool.execute(
    `SELECT event_id, event_date, event_type, title, google_event_id, sync_status
     FROM calendar_event
     WHERE user_id = ?
     ORDER BY event_date ASC`,
    [userId]
  );

  return rows;
}

async function saveAcademiaCredentials(userId, { collegeEmail, encryptedPassword }) {
  await pool.execute(
    `INSERT INTO academia_account
      (user_id, college_email, password_encrypted, status, last_error)
     VALUES (?, ?, ?, 'connected', NULL)
     ON DUPLICATE KEY UPDATE
      college_email = VALUES(college_email),
      password_encrypted = VALUES(password_encrypted),
      status = 'connected',
      last_error = NULL,
      updated_at = CURRENT_TIMESTAMP`,
    [userId, collegeEmail, encryptedPassword]
  );
}

async function getAcademiaAccount(userId) {
  const [rows] = await pool.execute(
    `SELECT user_id, college_email, password_encrypted, status, last_synced_at, last_error
     FROM academia_account
     WHERE user_id = ?`,
    [userId]
  );

  return rows[0] || null;
}

async function updateAcademiaSyncState(userId, { status, lastError = null }) {
  await pool.execute(
    `UPDATE academia_account
     SET status = ?,
         last_synced_at = CURRENT_TIMESTAMP,
         last_error = ?
     WHERE user_id = ?`,
    [status, lastError, userId]
  );
}

async function clearAcademiaCaches(userId) {
  await pool.execute(`DELETE FROM academia_timetable_cache WHERE user_id = ?`, [userId]);
  await pool.execute(`DELETE FROM academia_marks_cache WHERE user_id = ?`, [userId]);
  await pool.execute(`DELETE FROM academia_attendance_cache WHERE user_id = ?`, [userId]);
}

async function insertAcademiaTimetableRows(userId, rows) {
  if (!rows.length) {
    return;
  }

  for (const row of rows) {
    await pool.execute(
      `INSERT INTO academia_timetable_cache
        (id, user_id, day_order, day_label, start_time, end_time, subject_name, faculty_name, room_label)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        userId,
        row.dayOrder || null,
        row.dayLabel || null,
        row.startTime || null,
        row.endTime || null,
        row.subjectName,
        row.facultyName || null,
        row.roomLabel || null
      ]
    );
  }
}

async function insertAcademiaMarksRows(userId, rows) {
  if (!rows.length) {
    return;
  }

  for (const row of rows) {
    await pool.execute(
      `INSERT INTO academia_marks_cache
        (id, user_id, subject_name, component_name, score, max_score, percentage)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [row.id, userId, row.subjectName, row.componentName || null, row.score, row.maxScore, row.percentage]
    );
  }
}

async function insertAcademiaAttendanceRows(userId, rows) {
  if (!rows.length) {
    return;
  }

  for (const row of rows) {
    await pool.execute(
      `INSERT INTO academia_attendance_cache
        (id, user_id, subject_name, attended_classes, total_classes, attendance_percentage)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [row.id, userId, row.subjectName, row.attendedClasses, row.totalClasses, row.attendancePercentage]
    );
  }
}

async function listAcademiaTimetableRows(userId) {
  const [rows] = await pool.execute(
    `SELECT id, day_order, day_label, start_time, end_time, subject_name, faculty_name, room_label
     FROM academia_timetable_cache
     WHERE user_id = ?
     ORDER BY COALESCE(day_order, 99), start_time, subject_name`,
    [userId]
  );

  return rows;
}

async function listAcademiaMarksRows(userId) {
  const [rows] = await pool.execute(
    `SELECT id, subject_name, component_name, score, max_score, percentage
     FROM academia_marks_cache
     WHERE user_id = ?
     ORDER BY subject_name ASC`,
    [userId]
  );

  return rows;
}

async function listAcademiaAttendanceRows(userId) {
  const [rows] = await pool.execute(
    `SELECT id, subject_name, attended_classes, total_classes, attendance_percentage
     FROM academia_attendance_cache
     WHERE user_id = ?
     ORDER BY subject_name ASC`,
    [userId]
  );

  return rows;
}

module.exports = {
  saveGoogleTokens,
  getUserGoogleTokens,
  listUsersWithRefreshToken,
  createCalendarEventRecord,
  updateCalendarEventSync,
  listPendingCalendarEvents,
  getWorkoutSessionById,
  updateWorkoutGoogleSync,
  createEmailEvent,
  listCalendarEventsByUser,
  saveAcademiaCredentials,
  getAcademiaAccount,
  updateAcademiaSyncState,
  clearAcademiaCaches,
  insertAcademiaTimetableRows,
  insertAcademiaMarksRows,
  insertAcademiaAttendanceRows,
  listAcademiaTimetableRows,
  listAcademiaMarksRows,
  listAcademiaAttendanceRows
};
