const pool = require("../config/db");

function isMissingGoogleAccountTable(error) {
  return String(error?.code || "") === "ER_NO_SUCH_TABLE";
}

function toLegacyGoogleAccountRow(row) {
  if (!row || !row.google_access_token) {
    return null;
  }

  return {
    account_id: `legacy-${row.user_id}`,
    user_id: row.user_id,
    google_id: row.google_id || null,
    google_email: null,
    google_name: null,
    google_access_token: row.google_access_token,
    google_refresh_token: row.google_refresh_token || null,
    google_token_expiry: row.google_token_expiry || null,
    is_primary: 1,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  };
}

async function getLegacyGoogleTokens(userId) {
  const [rows] = await pool.execute(
    `SELECT user_id, google_id, google_access_token, google_refresh_token, google_token_expiry
     FROM app_user
     WHERE user_id = ?`,
    [userId]
  );

  return toLegacyGoogleAccountRow(rows[0] || null);
}

async function mirrorPrimaryGoogleAccountToLegacy(connection, userId, accountRow) {
  if (!accountRow) {
    await connection.execute(
      `UPDATE app_user
       SET google_id = NULL,
           google_access_token = NULL,
           google_refresh_token = NULL,
           google_token_expiry = NULL
       WHERE user_id = ?`,
      [userId]
    );
    return;
  }

  await connection.execute(
    `UPDATE app_user
     SET google_id = ?,
         google_access_token = ?,
         google_refresh_token = ?,
         google_token_expiry = ?
     WHERE user_id = ?`,
    [
      accountRow.google_id || null,
      accountRow.google_access_token || null,
      accountRow.google_refresh_token || null,
      accountRow.google_token_expiry || null,
      userId
    ]
  );
}

async function listUserGoogleAccountsWithTokens(userId) {
  try {
    const [rows] = await pool.execute(
      `SELECT account_id, user_id, google_id, google_email, google_name,
              google_access_token, google_refresh_token, google_token_expiry, is_primary,
              created_at, updated_at
       FROM google_account
       WHERE user_id = ?
       ORDER BY is_primary DESC, updated_at DESC, created_at DESC`,
      [userId]
    );

    if (rows.length > 0) {
      return rows;
    }
  } catch (error) {
    if (!isMissingGoogleAccountTable(error)) {
      throw error;
    }
  }

  const legacy = await getLegacyGoogleTokens(userId);
  return legacy ? [legacy] : [];
}

async function listUserGoogleAccounts(userId) {
  const rows = await listUserGoogleAccountsWithTokens(userId);
  return rows.map((row) => ({
    account_id: row.account_id,
    user_id: row.user_id,
    google_id: row.google_id,
    google_email: row.google_email,
    google_name: row.google_name,
    google_token_expiry: row.google_token_expiry,
    is_primary: Number(row.is_primary || 0) === 1,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  }));
}

async function getGoogleAccountById(userId, accountId) {
  if (!accountId) {
    return null;
  }

  try {
    const [rows] = await pool.execute(
      `SELECT account_id, user_id, google_id, google_email, google_name,
              google_access_token, google_refresh_token, google_token_expiry, is_primary,
              created_at, updated_at
       FROM google_account
       WHERE user_id = ? AND account_id = ?
       LIMIT 1`,
      [userId, accountId]
    );
    return rows[0] || null;
  } catch (error) {
    if (!isMissingGoogleAccountTable(error)) {
      throw error;
    }
    return null;
  }
}

async function getPrimaryGoogleAccountTokens(userId) {
  const rows = await listUserGoogleAccountsWithTokens(userId);
  return rows[0] || null;
}

async function getFitGoogleAccountId(userId) {
  const [rows] = await pool.execute(
    `SELECT fit_google_account_id
     FROM app_user
     WHERE user_id = ?
     LIMIT 1`,
    [userId]
  );
  return rows[0]?.fit_google_account_id || null;
}

async function setFitGoogleAccountSelectionOnce(userId, accountId) {
  const [result] = await pool.execute(
    `UPDATE app_user
     SET fit_google_account_id = ?
     WHERE user_id = ?
       AND fit_google_account_id IS NULL`,
    [accountId, userId]
  );
  return Number(result.affectedRows || 0) === 1;
}

async function clearFitGoogleAccountSelection(userId) {
  await pool.execute(
    `UPDATE app_user
     SET fit_google_account_id = NULL
     WHERE user_id = ?`,
    [userId]
  );
}

async function saveGoogleTokens(userId, {
  googleId,
  googleEmail = null,
  googleName = null,
  accessToken,
  refreshToken,
  tokenExpiry,
  setPrimary = true
}) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    if (!googleId) {
      await connection.execute(
        `UPDATE app_user
         SET google_access_token = ?,
             google_refresh_token = COALESCE(?, google_refresh_token),
             google_token_expiry = COALESCE(?, google_token_expiry)
         WHERE user_id = ?`,
        [accessToken || null, refreshToken || null, tokenExpiry || null, userId]
      );
      await connection.commit();
      return;
    }

    try {
      if (setPrimary) {
        await connection.execute(`UPDATE google_account SET is_primary = FALSE WHERE user_id = ?`, [userId]);
      }

      await connection.execute(
        `INSERT INTO google_account
          (account_id, user_id, google_id, google_email, google_name,
           google_access_token, google_refresh_token, google_token_expiry, is_primary)
         VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           google_email = VALUES(google_email),
           google_name = VALUES(google_name),
           google_access_token = VALUES(google_access_token),
           google_refresh_token = COALESCE(VALUES(google_refresh_token), google_refresh_token),
           google_token_expiry = COALESCE(VALUES(google_token_expiry), google_token_expiry),
           is_primary = IF(VALUES(is_primary), TRUE, is_primary),
           updated_at = CURRENT_TIMESTAMP`,
        [
          userId,
          googleId || "",
          googleEmail || null,
          googleName || null,
          accessToken || null,
          refreshToken || null,
          tokenExpiry || null,
          setPrimary ? 1 : 0
        ]
      );

      const [accountRows] = await connection.execute(
        `SELECT account_id, user_id, google_id, google_email, google_name,
                google_access_token, google_refresh_token, google_token_expiry, is_primary,
                created_at, updated_at
         FROM google_account
         WHERE user_id = ? AND google_id = ?
         LIMIT 1`,
        [userId, googleId || ""]
      );
      const account = accountRows[0] || null;

      if (setPrimary || !account?.is_primary) {
        const [primaryRows] = await connection.execute(
          `SELECT account_id, user_id, google_id, google_email, google_name,
                  google_access_token, google_refresh_token, google_token_expiry, is_primary
           FROM google_account
           WHERE user_id = ?
           ORDER BY is_primary DESC, updated_at DESC, created_at DESC
           LIMIT 1`,
          [userId]
        );
        await mirrorPrimaryGoogleAccountToLegacy(connection, userId, primaryRows[0] || null);
      }

      await connection.commit();
    } catch (error) {
      if (!isMissingGoogleAccountTable(error)) {
        throw error;
      }

      await connection.execute(
        `UPDATE app_user
         SET google_id = COALESCE(?, google_id),
             google_access_token = ?,
             google_refresh_token = COALESCE(?, google_refresh_token),
             google_token_expiry = COALESCE(?, google_token_expiry)
         WHERE user_id = ?`,
        [googleId || null, accessToken || null, refreshToken || null, tokenExpiry || null, userId]
      );
      await connection.commit();
    }
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function setPrimaryGoogleAccount(userId, accountId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [existingRows] = await connection.execute(
      `SELECT account_id
       FROM google_account
       WHERE user_id = ? AND account_id = ?
       LIMIT 1`,
      [userId, accountId]
    );
    if (!existingRows[0]) {
      await connection.rollback();
      return false;
    }

    const [result] = await connection.execute(
      `UPDATE google_account
       SET is_primary = (account_id = ?)
       WHERE user_id = ?`,
      [accountId, userId]
    );

    if (Number(result.affectedRows || 0) === 0) {
      await connection.rollback();
      return false;
    }

    const [rows] = await connection.execute(
      `SELECT account_id, user_id, google_id, google_email, google_name,
              google_access_token, google_refresh_token, google_token_expiry, is_primary
       FROM google_account
       WHERE user_id = ?
       ORDER BY is_primary DESC, updated_at DESC, created_at DESC
       LIMIT 1`,
      [userId]
    );
    await mirrorPrimaryGoogleAccountToLegacy(connection, userId, rows[0] || null);

    await connection.commit();
    return Number(result.changedRows || 0) > 0 || Number(result.affectedRows || 0) > 0;
  } catch (error) {
    await connection.rollback();
    if (isMissingGoogleAccountTable(error)) {
      return false;
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function removeGoogleAccount(userId, accountId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [result] = await connection.execute(
      `DELETE FROM google_account
       WHERE user_id = ? AND account_id = ?`,
      [userId, accountId]
    );
    if (Number(result.affectedRows || 0) === 0) {
      await connection.rollback();
      return false;
    }

    const [rows] = await connection.execute(
      `SELECT account_id, user_id, google_id, google_email, google_name,
              google_access_token, google_refresh_token, google_token_expiry, is_primary
       FROM google_account
       WHERE user_id = ?
       ORDER BY is_primary DESC, updated_at DESC, created_at DESC`,
      [userId]
    );

    if (rows.length > 0 && !rows.some((row) => Number(row.is_primary || 0) === 1)) {
      await connection.execute(
        `UPDATE google_account
         SET is_primary = (account_id = ?)
         WHERE user_id = ?`,
        [rows[0].account_id, userId]
      );
      rows[0].is_primary = 1;
    }

    await mirrorPrimaryGoogleAccountToLegacy(connection, userId, rows[0] || null);
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    if (isMissingGoogleAccountTable(error)) {
      return false;
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function listGoogleAccountsWithRefreshToken() {
  try {
    const [rows] = await pool.execute(
      `SELECT account_id, user_id, google_id, google_email, google_name,
              google_access_token, google_refresh_token, google_token_expiry, is_primary
       FROM google_account
       WHERE google_refresh_token IS NOT NULL
       ORDER BY updated_at DESC`
    );

    if (rows.length > 0) {
      return rows;
    }
  } catch (error) {
    if (!isMissingGoogleAccountTable(error)) {
      throw error;
    }
  }

  const [legacyRows] = await pool.execute(
    `SELECT user_id, google_id, google_access_token, google_refresh_token, google_token_expiry
     FROM app_user
     WHERE google_refresh_token IS NOT NULL`
  );
  return legacyRows.map((row) => toLegacyGoogleAccountRow(row)).filter(Boolean);
}

async function listUsersWithRefreshToken() {
  const accounts = await listGoogleAccountsWithRefreshToken();
  const uniqueUsers = new Map();
  for (const row of accounts) {
    if (!uniqueUsers.has(row.user_id)) {
      uniqueUsers.set(row.user_id, {
        user_id: row.user_id,
        google_access_token: row.google_access_token || null,
        google_refresh_token: row.google_refresh_token || null
      });
    }
  }
  return [...uniqueUsers.values()];
}

async function clearGoogleTokens(userId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    try {
      await connection.execute(`DELETE FROM google_account WHERE user_id = ?`, [userId]);
    } catch (error) {
      if (!isMissingGoogleAccountTable(error)) {
        throw error;
      }
    }
    await connection.execute(
      `UPDATE app_user
       SET google_id = NULL,
           google_access_token = NULL,
           google_refresh_token = NULL,
           google_token_expiry = NULL,
           fit_google_account_id = NULL
       WHERE user_id = ?`,
      [userId]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getUserGoogleTokens(userId) {
  return getPrimaryGoogleAccountTokens(userId);
}

async function saveOAuthStateNonce({ nonce, userId, expiresAt }) {
  await pool.execute(
    `INSERT INTO oauth_state_nonce (nonce, user_id, expires_at)
     VALUES (?, ?, ?)`,
    [nonce, userId, expiresAt]
  );
}

async function consumeOAuthStateNonce({ nonce, userId }) {
  const [result] = await pool.execute(
    `UPDATE oauth_state_nonce
     SET used_at = CURRENT_TIMESTAMP
     WHERE nonce = ?
       AND user_id = ?
       AND used_at IS NULL
       AND expires_at >= CURRENT_TIMESTAMP`,
    [nonce, userId]
  );
  return Number(result.affectedRows || 0) === 1;
}

async function purgeOAuthStateNonces() {
  const [result] = await pool.execute(
    `DELETE FROM oauth_state_nonce
     WHERE (used_at IS NOT NULL AND used_at < (CURRENT_TIMESTAMP - INTERVAL 1 DAY))
        OR expires_at < (CURRENT_TIMESTAMP - INTERVAL 1 DAY)`
  );
  return Number(result.affectedRows || 0);
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

async function getWorkoutSessionById(sessionId, userId = null) {
  const sql = userId
    ? `SELECT session_id, user_id, workout_date, workout_type, muscle_group, calories_burned, duration_minutes
       FROM workout_session
       WHERE session_id = ? AND user_id = ?`
    : `SELECT session_id, user_id, workout_date, workout_type, muscle_group, calories_burned, duration_minutes
       FROM workout_session
       WHERE session_id = ?`;
  const params = userId ? [sessionId, userId] : [sessionId];
  const [rows] = await pool.execute(sql, params);

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

async function createEmailEvent({
  id,
  userId,
  subject,
  parsedDeadline,
  confidenceScore,
  sourceMessageId = null,
  sourceAccountEmail = null
}) {
  await pool.execute(
    `INSERT INTO email_event
      (id, user_id, subject, parsed_deadline, source, source_message_id, source_account_email, confidence_score)
     VALUES (?, ?, ?, ?, 'gmail', ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      subject = VALUES(subject),
      parsed_deadline = VALUES(parsed_deadline),
      confidence_score = VALUES(confidence_score)`,
    [id, userId, subject, parsedDeadline || null, sourceMessageId || null, sourceAccountEmail || null, confidenceScore]
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
  getFitGoogleAccountId,
  setFitGoogleAccountSelectionOnce,
  clearFitGoogleAccountSelection,
  listUserGoogleAccounts,
  listUserGoogleAccountsWithTokens,
  getGoogleAccountById,
  getPrimaryGoogleAccountTokens,
  setPrimaryGoogleAccount,
  removeGoogleAccount,
  listGoogleAccountsWithRefreshToken,
  listUsersWithRefreshToken,
  clearGoogleTokens,
  saveOAuthStateNonce,
  consumeOAuthStateNonce,
  purgeOAuthStateNonces,
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
