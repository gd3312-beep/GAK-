const { randomUUID, createHash } = require("crypto");
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
              google_access_token, google_refresh_token, google_token_expiry, granted_scopes, is_primary,
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
    granted_scopes: row.granted_scopes || null,
    is_primary: Number(row.is_primary || 0) === 1,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  }));
}

async function updateGoogleAccountScopes(userId, accountId, grantedScopes) {
  if (!userId || !accountId) {
    return false;
  }
  const [result] = await pool.execute(
    `UPDATE google_account
     SET granted_scopes = ?
     WHERE user_id = ? AND account_id = ?`,
    [grantedScopes || null, userId, accountId]
  );
  return Number(result.affectedRows || 0) === 1;
}

async function getGoogleAccountById(userId, accountId) {
  if (!accountId) {
    return null;
  }

  try {
    const [rows] = await pool.execute(
      `SELECT account_id, user_id, google_id, google_email, google_name,
              google_access_token, google_refresh_token, google_token_expiry, granted_scopes, is_primary,
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
  grantedScopes = null,
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
           google_access_token, google_refresh_token, google_token_expiry, granted_scopes, is_primary)
         VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           google_email = VALUES(google_email),
           google_name = VALUES(google_name),
           google_access_token = VALUES(google_access_token),
           google_refresh_token = COALESCE(VALUES(google_refresh_token), google_refresh_token),
           google_token_expiry = COALESCE(VALUES(google_token_expiry), google_token_expiry),
           granted_scopes = COALESCE(VALUES(granted_scopes), granted_scopes),
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
          grantedScopes || null,
          setPrimary ? 1 : 0
        ]
      );

      const [accountRows] = await connection.execute(
        `SELECT account_id, user_id, google_id, google_email, google_name,
                google_access_token, google_refresh_token, google_token_expiry, granted_scopes, is_primary,
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
                  google_access_token, google_refresh_token, google_token_expiry, granted_scopes, is_primary
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
              google_access_token, google_refresh_token, google_token_expiry, granted_scopes, is_primary
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

async function getEmailEventByMessage({ userId, sourceMessageId, sourceAccountEmail }) {
  const msgId = String(sourceMessageId || "").trim();
  const acct = String(sourceAccountEmail || "").trim();
  if (!msgId || !acct) return null;

  const [rows] = await pool.execute(
    `SELECT id, subject, parsed_deadline, source_message_id, source_account_email, confidence_score, created_at
     FROM email_event
     WHERE user_id = ?
       AND source = 'gmail'
       AND source_account_email = ?
       AND source_message_id = ?
     LIMIT 1`,
    [userId, acct, msgId]
  );

  return rows[0] || null;
}

async function upsertCalendarEventByGoogleId({ userId, googleEventId, eventDate, eventType, title, syncStatus = "synced" }) {
  const googleId = String(googleEventId || "").trim();
  if (!googleId) {
    return { eventId: null, upserted: false };
  }

  // Requires a unique index on (user_id, google_event_id).
  const eventId = randomUUID();
  await pool.execute(
    `INSERT INTO calendar_event
      (event_id, user_id, event_date, event_type, title, google_event_id, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      event_date = VALUES(event_date),
      event_type = VALUES(event_type),
      title = VALUES(title),
      sync_status = VALUES(sync_status)`,
    [eventId, userId, eventDate, eventType, title, googleId, syncStatus]
  );

  return { eventId, upserted: true };
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

function stableId(prefix, ...parts) {
  const raw = parts.map((part) => String(part || "").trim().toLowerCase()).join("|");
  const digest = createHash("sha1").update(raw).digest("hex").slice(0, 24);
  return `${prefix}_${digest}`;
}

function cleanLabel(value, maxLen = 255) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLen);
}

function normalizeSqlTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const ss = Number(m[3] || 0);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || !Number.isFinite(ss)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59 || ss < 0 || ss > 59) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

async function getAcademicProfileForUser(userId) {
  const [rows] = await pool.execute(
    `SELECT section_id, academic_unit_id, campus_id, program, current_semester, admission_year
     FROM academic_profile
     WHERE user_id = ?
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function replaceSectionUnifiedTimetableFromAcademia(userId, rows) {
  const profile = await getAcademicProfileForUser(userId);
  if (!profile || !profile.section_id || !profile.academic_unit_id || !profile.campus_id) {
    throw new Error("Academic profile must include section_id, academic_unit_id, and campus_id before syncing reports");
  }

  const cleanRows = (rows || [])
    .map((row) => ({
      dayOrder: Number.isFinite(Number(row?.dayOrder)) ? Math.max(1, Math.min(7, Math.round(Number(row.dayOrder)))) : null,
      startTime: normalizeSqlTime(row?.startTime),
      endTime: normalizeSqlTime(row?.endTime),
      subjectName: cleanLabel(row?.subjectName),
      facultyName: cleanLabel(row?.facultyName),
      roomLabel: cleanLabel(row?.roomLabel)
    }))
    .filter((row) => row.subjectName);

  if (cleanRows.length === 0) {
    return { written: false, insertedEntries: 0 };
  }

  const semester = Number(profile.current_semester);
  const normalizedSemester = Number.isFinite(semester) && semester > 0 ? Math.round(semester) : 1;
  const academicYear = new Date().getFullYear();
  const batch = cleanLabel(profile.program || profile.section_id, 255) || "default";
  const unifiedTimetableId = stableId(
    "ut",
    profile.academic_unit_id,
    profile.campus_id,
    normalizedSemester,
    batch
  );

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.execute(
      `INSERT INTO unified_timetable
        (unified_timetable_id, academic_year, semester, batch, academic_unit_id, campus_id)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        academic_year = VALUES(academic_year),
        semester = VALUES(semester),
        batch = VALUES(batch),
        academic_unit_id = VALUES(academic_unit_id),
        campus_id = VALUES(campus_id)`,
      [
        unifiedTimetableId,
        academicYear,
        normalizedSemester,
        batch,
        profile.academic_unit_id,
        profile.campus_id
      ]
    );

    const entries = [];
    for (const row of cleanRows) {
      const subjectId = stableId("sub", profile.academic_unit_id, normalizedSemester, row.subjectName);
      await connection.execute(
        `INSERT INTO subject
          (subject_id, subject_name, credits, minimum_attendance_percentage, academic_unit_id, program, semester)
         VALUES (?, ?, NULL, NULL, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
          subject_name = VALUES(subject_name),
          academic_unit_id = VALUES(academic_unit_id),
          program = VALUES(program),
          semester = VALUES(semester)`,
        [subjectId, row.subjectName, profile.academic_unit_id, profile.program || null, normalizedSemester]
      );

      let facultyId = null;
      if (row.facultyName) {
        facultyId = stableId("fac", profile.academic_unit_id, row.facultyName);
        await connection.execute(
          `INSERT INTO faculty (faculty_id, faculty_name, department)
           VALUES (?, ?, NULL)
           ON DUPLICATE KEY UPDATE faculty_name = VALUES(faculty_name)`,
          [facultyId, row.facultyName]
        );
      }

      let classroomId = null;
      if (row.roomLabel) {
        classroomId = stableId("cls", profile.campus_id, row.roomLabel);
        await connection.execute(
          `INSERT INTO classroom (classroom_id, room_number, building_name)
           VALUES (?, ?, NULL)
           ON DUPLICATE KEY UPDATE room_number = VALUES(room_number)`,
          [classroomId, row.roomLabel]
        );
      }

      const timetableEntryId = stableId(
        "tte",
        profile.section_id,
        row.dayOrder || "",
        row.startTime || "",
        row.endTime || "",
        subjectId,
        facultyId || "",
        classroomId || ""
      );

      entries.push({
        timetableEntryId,
        subjectId,
        facultyId,
        classroomId,
        dayOrder: row.dayOrder,
        startTime: row.startTime,
        endTime: row.endTime
      });
    }

    await connection.execute(`DELETE FROM timetable_entry WHERE section_id = ?`, [profile.section_id]);

    for (const row of entries) {
      await connection.execute(
        `INSERT INTO timetable_entry
          (timetable_entry_id, unified_timetable_id, section_id, subject_id, faculty_id, classroom_id, day_order, start_time, end_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.timetableEntryId,
          unifiedTimetableId,
          profile.section_id,
          row.subjectId,
          row.facultyId || null,
          row.classroomId || null,
          row.dayOrder,
          row.startTime,
          row.endTime
        ]
      );
    }

    await connection.commit();
    return {
      written: true,
      insertedEntries: entries.length,
      sectionId: profile.section_id,
      unifiedTimetableId
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateAcademiaSyncState(userId, { status, lastError = null }) {
  // Older deployments may have a shorter `last_error` column than current schema.
  // Trim defensively so scrape failures never fail the state update itself.
  const safeLastError = lastError ? String(lastError).slice(0, 240) : null;
  await pool.execute(
    `UPDATE academia_account
     SET status = ?,
         last_synced_at = CURRENT_TIMESTAMP,
         last_error = ?
     WHERE user_id = ?`,
    [status, safeLastError, userId]
  );
}

async function clearAcademiaCaches(userId) {
  await pool.execute(`DELETE FROM academia_timetable_cache WHERE user_id = ?`, [userId]);
  await pool.execute(`DELETE FROM academia_marks_cache WHERE user_id = ?`, [userId]);
  await pool.execute(`DELETE FROM academia_attendance_cache WHERE user_id = ?`, [userId]);
}

async function clearAcademiaTimetableCache(userId) {
  await pool.execute(`DELETE FROM academia_timetable_cache WHERE user_id = ?`, [userId]);
}

async function clearAcademiaMarksCache(userId) {
  await pool.execute(`DELETE FROM academia_marks_cache WHERE user_id = ?`, [userId]);
}

async function clearAcademiaAttendanceCache(userId) {
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
  updateGoogleAccountScopes,
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
  getEmailEventByMessage,
  listCalendarEventsByUser,
  upsertCalendarEventByGoogleId,
  saveAcademiaCredentials,
  getAcademiaAccount,
  getAcademicProfileForUser,
  replaceSectionUnifiedTimetableFromAcademia,
  updateAcademiaSyncState,
  clearAcademiaCaches,
  clearAcademiaTimetableCache,
  clearAcademiaMarksCache,
  clearAcademiaAttendanceCache,
  insertAcademiaTimetableRows,
  insertAcademiaMarksRows,
  insertAcademiaAttendanceRows,
  listAcademiaTimetableRows,
  listAcademiaMarksRows,
  listAcademiaAttendanceRows
};
