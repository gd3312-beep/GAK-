const { createHash } = require("crypto");
const pool = require("../config/db");
const { createId } = require("../utils/id.util");

function isMissingGoogleAccountTable(error) {
  return String(error?.code || "") === "ER_NO_SUCH_TABLE";
}

function isMissingAcademicSourceTable(error) {
  return String(error?.code || "") === "ER_NO_SUCH_TABLE";
}

function normalizeProviderCode(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (["college", "classroom", "nptel", "coursera", "udemy", "hackathon", "other"].includes(raw)) {
    return raw;
  }
  return "other";
}

function defaultRegisteredForProvider(providerCode) {
  return providerCode === "college" || providerCode === "classroom" || providerCode === "nptel";
}

function normalizeEnrollmentSourceKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 255);
}

function toSqlDateOnly(value) {
  if (!value) return null;
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function ensureAcademicProvider(providerCode) {
  const code = normalizeProviderCode(providerCode);
  const providerMeta = {
    college: { name: "College / University", group: "college", defaultRegistered: 1 },
    classroom: { name: "Google Classroom", group: "platform", defaultRegistered: 1 },
    nptel: { name: "NPTEL", group: "platform", defaultRegistered: 1 },
    coursera: { name: "Coursera", group: "platform", defaultRegistered: 0 },
    udemy: { name: "Udemy", group: "platform", defaultRegistered: 0 },
    hackathon: { name: "Hackathon", group: "hackathon", defaultRegistered: 0 },
    other: { name: "Other", group: "other", defaultRegistered: 0 }
  }[code];

  await pool.execute(
    `INSERT INTO academic_provider (provider_code, provider_name, provider_group, default_registered)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      provider_name = VALUES(provider_name),
      provider_group = VALUES(provider_group),
      default_registered = VALUES(default_registered)`,
    [code, providerMeta.name, providerMeta.group, providerMeta.defaultRegistered]
  );
}

async function upsertAcademicEnrollment(userId, {
  providerCode,
  sourceType = "course",
  sourceKey,
  sourceName,
  senderEmail = null,
  isRegistered = false,
  registrationMode = "auto",
  registrationSignal = false,
  completionSignal = false,
  parsedDeadline = null
}) {
  const provider = normalizeProviderCode(providerCode);
  const enrollmentName = String(sourceName || "").replace(/\s+/g, " ").trim().slice(0, 255);
  const key = normalizeEnrollmentSourceKey(sourceKey || enrollmentName);
  if (!key || !enrollmentName) {
    return null;
  }

  const normalizedSourceType = ["course", "classroom", "hackathon", "other"].includes(String(sourceType || "").toLowerCase())
    ? String(sourceType || "").toLowerCase()
    : "other";
  const normalizedRegistrationMode = String(registrationMode || "").toLowerCase() === "manual" ? "manual" : "auto";
  const safeSender = senderEmail ? String(senderEmail).trim().slice(0, 255).toLowerCase() : null;
  const endsOn = toSqlDateOnly(parsedDeadline);
  const shouldRegister = Boolean(isRegistered || registrationSignal || defaultRegisteredForProvider(provider));
  const nextStatus = completionSignal ? "completed" : "active";

  try {
    await ensureAcademicProvider(provider);
    await pool.execute(
      `INSERT INTO academic_enrollment
        (enrollment_id, user_id, provider_code, source_type, source_key, source_name, sender_email, is_registered, registration_mode, status, starts_on, ends_on, first_seen_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE
        source_name = VALUES(source_name),
        sender_email = COALESCE(VALUES(sender_email), sender_email),
        is_registered = CASE
          WHEN registration_mode = 'manual' THEN is_registered
          ELSE VALUES(is_registered)
        END,
        registration_mode = CASE
          WHEN registration_mode = 'manual' THEN 'manual'
          ELSE VALUES(registration_mode)
        END,
        status = CASE
          WHEN VALUES(status) = 'completed' THEN 'completed'
          WHEN status = 'completed' THEN status
          ELSE 'active'
        END,
        ends_on = CASE
          WHEN VALUES(ends_on) IS NULL THEN ends_on
          WHEN ends_on IS NULL THEN VALUES(ends_on)
          WHEN VALUES(ends_on) > ends_on THEN VALUES(ends_on)
          ELSE ends_on
        END,
        last_seen_at = CURRENT_TIMESTAMP`,
      [
        createId("enr"),
        userId,
        provider,
        normalizedSourceType,
        key,
        enrollmentName,
        safeSender,
        shouldRegister ? 1 : 0,
        normalizedRegistrationMode,
        nextStatus,
        endsOn
      ]
    );

    const [rows] = await pool.execute(
      `SELECT enrollment_id, user_id, provider_code, source_type, source_key, source_name, sender_email,
              is_registered, registration_mode, status, auto_delete_on_complete, starts_on, ends_on, first_seen_at, last_seen_at
       FROM academic_enrollment
       WHERE user_id = ? AND provider_code = ? AND source_key = ?
       LIMIT 1`,
      [userId, provider, key]
    );
    return rows[0] || null;
  } catch (error) {
    if (isMissingAcademicSourceTable(error)) {
      return {
        enrollment_id: null,
        user_id: userId,
        provider_code: provider,
        source_type: normalizedSourceType,
        source_key: key,
        source_name: enrollmentName,
        sender_email: safeSender,
        is_registered: shouldRegister ? 1 : 0,
        registration_mode: normalizedRegistrationMode,
        status: nextStatus,
        ends_on: endsOn
      };
    }
    throw error;
  }
}

async function listAcademicEnrollments(userId) {
  try {
    const [rows] = await pool.execute(
      `SELECT enrollment_id, provider_code, source_type, source_key, source_name, sender_email,
              is_registered, registration_mode, status, auto_delete_on_complete, starts_on, ends_on, first_seen_at, last_seen_at, created_at, updated_at
       FROM academic_enrollment
       WHERE user_id = ?
       ORDER BY is_registered DESC, last_seen_at DESC, created_at DESC`,
      [userId]
    );
    return rows;
  } catch (error) {
    if (isMissingAcademicSourceTable(error)) {
      return [];
    }
    throw error;
  }
}

async function registerAcademicEnrollment(userId, {
  providerCode,
  sourceType = "course",
  sourceName,
  sourceKey = null,
  senderEmail = null,
  endsOn = null
}) {
  return upsertAcademicEnrollment(userId, {
    providerCode,
    sourceType,
    sourceKey: sourceKey || sourceName,
    sourceName,
    senderEmail,
    registrationMode: "manual",
    isRegistered: true,
    registrationSignal: true,
    completionSignal: false,
    parsedDeadline: endsOn
  });
}

async function deleteAcademicEnrollment(userId, enrollmentId) {
  try {
    const [result] = await pool.execute(
      `DELETE FROM academic_enrollment
       WHERE user_id = ? AND enrollment_id = ?`,
      [userId, enrollmentId]
    );
    return Number(result.affectedRows || 0) > 0;
  } catch (error) {
    if (isMissingAcademicSourceTable(error)) {
      return false;
    }
    throw error;
  }
}

async function purgeCompletedAcademicEnrollments(userId) {
  try {
    const [result] = await pool.execute(
      `DELETE FROM academic_enrollment
       WHERE user_id = ?
         AND auto_delete_on_complete = TRUE
         AND (
           status IN ('completed', 'expired', 'dropped')
           OR (ends_on IS NOT NULL AND ends_on < CURDATE())
         )`,
      [userId]
    );
    return Number(result.affectedRows || 0);
  } catch (error) {
    if (isMissingAcademicSourceTable(error)) {
      return 0;
    }
    throw error;
  }
}

async function purgeCompletedAcademicEnrollmentsAll() {
  try {
    const [result] = await pool.execute(
      `DELETE FROM academic_enrollment
       WHERE auto_delete_on_complete = TRUE
         AND (
           status IN ('completed', 'expired', 'dropped')
           OR (ends_on IS NOT NULL AND ends_on < CURDATE())
         )`
    );
    return Number(result.affectedRows || 0);
  } catch (error) {
    if (isMissingAcademicSourceTable(error)) {
      return 0;
    }
    throw error;
  }
}

async function purgeStaleAcademicDeadlines(userId) {
  const summary = { emailDeleted: 0, calendarDeleted: 0 };
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [emailResult] = await connection.execute(
      `DELETE FROM email_event
       WHERE user_id = ?
         AND parsed_deadline IS NOT NULL
         AND DATE(parsed_deadline) < CURDATE()`,
      [userId]
    );
    summary.emailDeleted = Number(emailResult.affectedRows || 0);

    const [calendarResult] = await connection.execute(
      `DELETE FROM calendar_event
       WHERE user_id = ?
         AND event_type = 'academic'
         AND DATE(event_date) < CURDATE()`,
      [userId]
    );
    summary.calendarDeleted = Number(calendarResult.affectedRows || 0);
    await connection.commit();
    return summary;
  } catch (error) {
    await connection.rollback();
    if (isMissingAcademicSourceTable(error)) {
      return summary;
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function purgeStaleAcademicDeadlinesAll() {
  const summary = { emailDeleted: 0, calendarDeleted: 0 };
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [emailResult] = await connection.execute(
      `DELETE FROM email_event
       WHERE parsed_deadline IS NOT NULL
         AND DATE(parsed_deadline) < CURDATE()`
    );
    summary.emailDeleted = Number(emailResult.affectedRows || 0);

    const [calendarResult] = await connection.execute(
      `DELETE FROM calendar_event
       WHERE event_type = 'academic'
         AND DATE(event_date) < CURDATE()`
    );
    summary.calendarDeleted = Number(calendarResult.affectedRows || 0);
    await connection.commit();
    return summary;
  } catch (error) {
    await connection.rollback();
    if (isMissingAcademicSourceTable(error)) {
      return summary;
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function listUsersWithConnectedAcademia() {
  try {
    const [rows] = await pool.execute(
      `SELECT user_id
       FROM academia_account
       WHERE status = 'connected'
         AND password_encrypted IS NOT NULL`
    );
    return rows.map((row) => row.user_id).filter(Boolean);
  } catch (error) {
    if (isMissingAcademicSourceTable(error)) {
      return [];
    }
    throw error;
  }
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
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          createId("ga"),
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
    `SELECT event_id, user_id, DATE_FORMAT(event_date, '%Y-%m-%d') AS event_date, event_type, title
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

async function getCompletedWorkoutCaloriesForDate(userId, workoutDate) {
  const [rows] = await pool.execute(
    `SELECT
      ROUND(SUM(
        CASE
          WHEN COALESCE(ws.calories_burned, 0) > 0 THEN COALESCE(ws.calories_burned, 0)
          ELSE GREATEST(120, COALESCE(ws.duration_minutes, 60) * 6)
        END
      ), 2) AS total_calories
     FROM workout_session ws
     JOIN workout_action wa
       ON wa.session_id = ws.session_id
      AND wa.user_id = ws.user_id
     WHERE ws.user_id = ?
       AND DATE(ws.workout_date) = DATE(?)
       AND LOWER(wa.status) IN ('done', 'completed')`,
    [userId, String(workoutDate || "").slice(0, 10)]
  );

  return Number(rows?.[0]?.total_calories || 0);
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

async function reconcileAcademicCalendarEventDateByTitle({ userId, title, eventDate }) {
  const safeTitle = String(title || "").trim().slice(0, 255);
  if (!safeTitle || !eventDate) return 0;
  const [result] = await pool.execute(
    `UPDATE calendar_event
     SET event_date = ?
     WHERE user_id = ?
       AND event_type = 'academic'
       AND title = ?`,
    [eventDate, userId, safeTitle]
  );
  return Number(result.affectedRows || 0);
}

async function reconcileAcademicCalendarEventTitleByDate({ userId, oldTitle, newTitle, eventDate }) {
  const safeOld = String(oldTitle || "").trim().slice(0, 255);
  const safeNew = String(newTitle || "").trim().slice(0, 255);
  if (!safeOld || !safeNew || !eventDate) return 0;
  const [result] = await pool.execute(
    `UPDATE calendar_event
     SET title = ?
     WHERE user_id = ?
       AND event_type = 'academic'
       AND title = ?
       AND DATE(event_date) = DATE(?)`,
    [safeNew, userId, safeOld, eventDate]
  );
  return Number(result.affectedRows || 0);
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
  const eventId = createId("cev");
  await pool.execute(
    `INSERT INTO calendar_event
     (event_id, user_id, event_date, event_type, title, google_event_id, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      event_date = VALUES(event_date),
      event_type = CASE
        WHEN VALUES(event_type) = 'personal' AND event_type IN ('academic', 'fitness', 'nutrition') THEN event_type
        ELSE VALUES(event_type)
      END,
      title = VALUES(title),
      sync_status = VALUES(sync_status)`,
    [eventId, userId, eventDate, eventType, title, googleId, syncStatus]
  );

  return { eventId, upserted: true };
}

async function normalizeCalendarGoogleEventIdNamespace({ userId, rawGoogleEventId, namespacedGoogleEventId }) {
  const raw = String(rawGoogleEventId || "").trim();
  const namespaced = String(namespacedGoogleEventId || "").trim();
  if (!raw || !namespaced || raw === namespaced) {
    return { updated: 0, deleted: 0 };
  }

  const [existingRows] = await pool.execute(
    `SELECT event_id
     FROM calendar_event
     WHERE user_id = ? AND google_event_id = ?
     LIMIT 1`,
    [userId, namespaced]
  );

  if (Array.isArray(existingRows) && existingRows.length > 0) {
    const [deleted] = await pool.execute(
      `DELETE FROM calendar_event
       WHERE user_id = ? AND google_event_id = ?`,
      [userId, raw]
    );
    return { updated: 0, deleted: Number(deleted?.affectedRows || 0) };
  }

  const [updated] = await pool.execute(
    `UPDATE calendar_event
     SET google_event_id = ?
     WHERE user_id = ? AND google_event_id = ?`,
    [namespaced, userId, raw]
  );
  return { updated: Number(updated?.affectedRows || 0), deleted: 0 };
}

async function listCalendarEventsByUser(userId) {
  const [rows] = await pool.execute(
    `SELECT event_id, DATE_FORMAT(event_date, '%Y-%m-%d') AS event_date, event_type, title, google_event_id, sync_status
     FROM calendar_event
     WHERE user_id = ?
       AND (event_type <> 'academic' OR DATE(event_date) >= CURDATE())
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
  try {
    const [rows] = await pool.execute(
      `SELECT user_id, college_email, password_encrypted, status, last_synced_at, last_error, last_sync_checksum
       FROM academia_account
       WHERE user_id = ?`,
      [userId]
    );
    return rows[0] || null;
  } catch (error) {
    if (String(error?.code || "") === "ER_BAD_FIELD_ERROR") {
      const [rows] = await pool.execute(
        `SELECT user_id, college_email, password_encrypted, status, last_synced_at, last_error
         FROM academia_account
         WHERE user_id = ?`,
        [userId]
      );
      return rows[0] || null;
    }
    throw error;
  }
}

function stableId(prefix, ...parts) {
  const raw = parts.map((part) => String(part || "").trim().toLowerCase()).join("|");
  const digest = createHash("sha1").update(raw).digest("hex").slice(0, 24);
  return `${prefix}_${digest}`;
}

function cleanLabel(value, maxLen = 255) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLen);
}

function slugifyKey(value, maxLen = 80) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, maxLen);
}

function extractBatchNumber(value) {
  const text = String(value || "");
  if (!text) return null;
  const byRoute = text.match(/batch[_\-\s]?(\d{1,2})/i);
  if (byRoute) {
    const n = Number(byRoute[1]);
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  const byLabel = text.match(/\bbatch\s*(\d{1,2})\b/i);
  if (byLabel) {
    const n = Number(byLabel[1]);
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  return null;
}

function resolveSharedBatchKey(profile, rows, options = {}) {
  const explicitBatchNumber = Number(options?.batchNumber);
  if (Number.isFinite(explicitBatchNumber) && explicitBatchNumber > 0) {
    return `batch_${Math.round(explicitBatchNumber)}`;
  }

  const batchHints = [
    options?.batchLabel,
    options?.sourceUrl,
    profile?.branch,
    profile?.program,
    profile?.section_id,
    ...(rows || []).map((row) => row?.batch || row?.batchLabel || row?.batch_label || row?.section || row?.sectionName || row?.section_name)
  ].filter(Boolean);

  for (const hint of batchHints) {
    const n = extractBatchNumber(hint);
    if (Number.isFinite(n) && n > 0) {
      return `batch_${Math.round(n)}`;
    }
  }

  const admissionYearRaw = Number(profile?.admission_year);
  if (Number.isFinite(admissionYearRaw) && admissionYearRaw >= 2000 && admissionYearRaw <= 2100) {
    return `cohort_${Math.round(admissionYearRaw)}`;
  }

  const programKey = slugifyKey(profile?.program || "", 60);
  if (programKey) {
    return `program_${programKey}`;
  }

  return "default";
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

function normalizeSqlDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return null;
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function inferDayOrderFromLabel(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return null;

  const dayOrderMatch = text.match(/day\s*[- ]?order\s*(\d+)/i) || text.match(/\bday\s*(\d+)\b/i);
  if (dayOrderMatch) {
    const day = Number(dayOrderMatch[1]);
    if (Number.isFinite(day) && day >= 1 && day <= 7) return day;
  }

  if (/monday|mon\b/.test(text)) return 1;
  if (/tuesday|tue\b/.test(text)) return 2;
  if (/wednesday|wed\b/.test(text)) return 3;
  if (/thursday|thu\b/.test(text)) return 4;
  if (/friday|fri\b/.test(text)) return 5;
  if (/saturday|sat\b/.test(text)) return 6;
  if (/sunday|sun\b/.test(text)) return 7;

  return null;
}

function isSlotLikeLabel(value) {
  const text = String(value || "").trim().toUpperCase();
  if (!text) return false;
  return /^([A-G][0-9]*|LAB[0-9]*)$/.test(text);
}

function buildSectionFingerprint(rows) {
  const normalized = (rows || [])
    .map((row) => {
      const dayRaw = row?.dayOrder ?? row?.day_order;
      const dayLabelRaw = row?.dayLabel ?? row?.day_label;
      const slotLikeLabel = isSlotLikeLabel(dayLabelRaw);
      const dayOrderRaw = dayRaw === null || dayRaw === undefined || dayRaw === "" ? Number.NaN : Number(dayRaw);
      const dayOrder = Number.isFinite(dayOrderRaw) && dayOrderRaw >= 1 && !slotLikeLabel
        ? Math.max(1, Math.min(7, Math.round(dayOrderRaw)))
        : inferDayOrderFromLabel(dayLabelRaw);
      return {
        dayOrder: dayOrder || "",
        dayLabel: cleanLabel(dayLabelRaw, 50).toLowerCase(),
        startTime: normalizeSqlTime(row?.startTime ?? row?.start_time) || "",
        endTime: normalizeSqlTime(row?.endTime ?? row?.end_time) || "",
        subjectName: cleanLabel(row?.subjectName ?? row?.subject_name).toLowerCase().replace(/^[0-9]{2}[a-z]{2,}\d+[a-z]?\s+/i, "")
      };
    })
    .filter((row) => row.subjectName)
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

  if (!normalized.length) return "default";
  return createHash("sha1").update(JSON.stringify(normalized)).digest("hex").slice(0, 16);
}

async function getAcademicProfileForUser(userId) {
  const [rows] = await pool.execute(
    `SELECT section_id, academic_unit_id, campus_id, university_id, program, current_semester, admission_year
     FROM academic_profile
     WHERE user_id = ?
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function ensurePrivateSectionForUser(userId, profile, rows) {
  if (!profile?.section_id) {
    return profile;
  }

  const [usageRows] = await pool.execute(
    `SELECT COUNT(*) AS section_users
     FROM academic_profile
     WHERE section_id = ?
       AND user_id <> ?`,
    [profile.section_id, userId]
  );

  const sharedUsers = Number(usageRows?.[0]?.section_users || 0);
  if (!Number.isFinite(sharedUsers) || sharedUsers <= 0) {
    return profile;
  }

  const semesterRaw = Number(profile.current_semester);
  const normalizedSemester = Number.isFinite(semesterRaw) && semesterRaw > 0 ? Math.round(semesterRaw) : 1;
  const nowYear = new Date().getFullYear();
  const fingerprint = buildSectionFingerprint(rows || []);
  const replacementSectionId = cleanLabel(
    stableId("sec", userId, profile.academic_unit_id || "default", normalizedSemester, fingerprint || "default"),
    255
  );
  const replacementSectionName = cleanLabel(
    `SEC-${String(userId || "").replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase() || "AUTO"}`,
    255
  ) || "SEC-AUTO";
  const replacementProgram = cleanLabel(profile.program || "General Program", 255) || "General Program";

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `INSERT INTO section (section_id, section_name, academic_year, semester, program, academic_unit_id)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        section_name = VALUES(section_name),
        academic_year = VALUES(academic_year),
        semester = VALUES(semester),
        program = VALUES(program),
        academic_unit_id = VALUES(academic_unit_id)`,
      [
        replacementSectionId,
        replacementSectionName,
        nowYear,
        normalizedSemester,
        replacementProgram,
        profile.academic_unit_id
      ]
    );
    await connection.execute(
      `UPDATE academic_profile
       SET section_id = ?
       WHERE user_id = ?`,
      [replacementSectionId, userId]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return {
    ...profile,
    section_id: replacementSectionId
  };
}

async function ensureAcademicProfileForReports(userId, rows) {
  const existing = await getAcademicProfileForUser(userId);
  if (existing && existing.section_id && existing.academic_unit_id && existing.campus_id) {
    return ensurePrivateSectionForUser(userId, existing, rows || []);
  }

  const nowYear = new Date().getFullYear();
  const semesterRaw = Number(existing?.current_semester);
  const normalizedSemester = Number.isFinite(semesterRaw) && semesterRaw > 0 ? Math.round(semesterRaw) : 1;
  const admissionYearRaw = Number(existing?.admission_year);
  const admissionYear = Number.isFinite(admissionYearRaw) && admissionYearRaw > 0 ? Math.round(admissionYearRaw) : nowYear;
  const sectionFingerprint = buildSectionFingerprint(rows);

  // Conservative defaults so reports sync can self-heal when academic_profile was never initialized.
  const universityId = cleanLabel(existing?.university_id || "univ_srmist", 255) || "univ_srmist";
  const campusId = cleanLabel(existing?.campus_id || stableId("camp", universityId, "kattankulathur"), 255);
  const academicUnitId = cleanLabel(existing?.academic_unit_id || stableId("au", campusId, "academia"), 255);
  const program = cleanLabel(existing?.program || "General Program", 255);
  const sectionId = cleanLabel(
    existing?.section_id || stableId("sec", userId, academicUnitId, normalizedSemester, sectionFingerprint),
    255
  );
  const sectionName = cleanLabel(`SEC-${sectionFingerprint.slice(0, 6).toUpperCase()}`, 255) || "SEC-AUTO";
  const profileId = createId("apro");

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.execute(
      `INSERT INTO university (university_id, university_name)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE
        university_name = COALESCE(university_name, VALUES(university_name))`,
      [universityId, "SRM Institute of Science and Technology"]
    );

    await connection.execute(
      `INSERT INTO campus (campus_id, campus_name, university_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
        campus_name = COALESCE(campus_name, VALUES(campus_name)),
        university_id = VALUES(university_id)`,
      [campusId, "Kattankulathur Campus", universityId]
    );

    await connection.execute(
      `INSERT INTO academic_unit (academic_unit_id, unit_name, unit_type, description, campus_id, university_id)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        unit_name = COALESCE(unit_name, VALUES(unit_name)),
        unit_type = COALESCE(unit_type, VALUES(unit_type)),
        description = COALESCE(description, VALUES(description)),
        campus_id = VALUES(campus_id),
        university_id = VALUES(university_id)`,
      [academicUnitId, "SRM Academic Unit", "school", "Auto-provisioned from Academia sync", campusId, universityId]
    );

    await connection.execute(
      `INSERT INTO section (section_id, section_name, academic_year, semester, program, academic_unit_id)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        section_name = VALUES(section_name),
        academic_year = VALUES(academic_year),
        semester = VALUES(semester),
        program = VALUES(program),
        academic_unit_id = VALUES(academic_unit_id)`,
      [sectionId, sectionName, nowYear, normalizedSemester, program, academicUnitId]
    );

    if (existing) {
      await connection.execute(
        `UPDATE academic_profile
         SET university_id = COALESCE(university_id, ?),
             campus_id = COALESCE(campus_id, ?),
             academic_unit_id = COALESCE(academic_unit_id, ?),
             section_id = COALESCE(section_id, ?),
             program = COALESCE(program, ?),
             admission_year = COALESCE(admission_year, ?),
             current_semester = COALESCE(current_semester, ?)
         WHERE user_id = ?`,
        [universityId, campusId, academicUnitId, sectionId, program, admissionYear, normalizedSemester, userId]
      );
    } else {
      await connection.execute(
        `INSERT INTO academic_profile
          (academic_profile_id, user_id, university_id, campus_id, academic_unit_id, section_id, program, branch, admission_year, current_semester)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
        [profileId, userId, universityId, campusId, academicUnitId, sectionId, program, admissionYear, normalizedSemester]
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return getAcademicProfileForUser(userId);
}

async function replaceSectionUnifiedTimetableFromAcademia(userId, rows, options = {}) {
  const profile = await ensureAcademicProfileForReports(userId, rows || []);
  if (!profile || !profile.section_id || !profile.academic_unit_id || !profile.campus_id) {
    throw new Error("Academic profile must include section_id, academic_unit_id, and campus_id before syncing reports");
  }

  const seen = new Set();
  const cleanRows = (rows || [])
    .map((row) => {
      const dayRaw = row?.dayOrder ?? row?.day_order;
      const dayLabelRaw = row?.dayLabel ?? row?.day_label;
      const slotLikeLabel = isSlotLikeLabel(dayLabelRaw);
      const dayOrderRaw = dayRaw === null || dayRaw === undefined || dayRaw === "" ? Number.NaN : Number(dayRaw);
      return {
        dayOrder: Number.isFinite(dayOrderRaw) && dayOrderRaw >= 1 && !slotLikeLabel
          ? Math.max(1, Math.min(7, Math.round(dayOrderRaw)))
          : inferDayOrderFromLabel(dayLabelRaw),
        startTime: normalizeSqlTime(row?.startTime ?? row?.start_time),
        endTime: normalizeSqlTime(row?.endTime ?? row?.end_time),
        subjectName: cleanLabel(row?.subjectName ?? row?.subject_name),
        facultyName: cleanLabel(row?.facultyName ?? row?.faculty_name),
        roomLabel: cleanLabel(row?.roomLabel ?? row?.room_label)
      };
    })
    .filter((row) => {
      if (!row.subjectName) return false;
      const dedupeKey = [
        row.dayOrder || "",
        row.startTime || "",
        row.endTime || "",
        row.subjectName.toLowerCase(),
        row.facultyName.toLowerCase(),
        row.roomLabel.toLowerCase()
      ].join("|");
      if (seen.has(dedupeKey)) return false;
      seen.add(dedupeKey);
      return true;
    });

  if (cleanRows.length === 0) {
    return { written: false, insertedEntries: 0 };
  }

  const semester = Number(profile.current_semester);
  const normalizedSemester = Number.isFinite(semester) && semester > 0 ? Math.round(semester) : 1;
  const academicYear = new Date().getFullYear();
  const batch = cleanLabel(resolveSharedBatchKey(profile, cleanRows, options), 255) || "default";
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

    for (const row of entries) {
      await connection.execute(
        `INSERT INTO timetable_entry
          (timetable_entry_id, unified_timetable_id, section_id, subject_id, faculty_id, classroom_id, day_order, start_time, end_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
          unified_timetable_id = VALUES(unified_timetable_id),
          section_id = VALUES(section_id),
          subject_id = VALUES(subject_id),
          faculty_id = VALUES(faculty_id),
          classroom_id = VALUES(classroom_id),
          day_order = VALUES(day_order),
          start_time = VALUES(start_time),
          end_time = VALUES(end_time)`,
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

    // Remove outdated entries for this section, but keep rows referenced by attendance_record
    // to avoid FK conflicts while old attendance rows still exist.
    const newEntryIds = entries.map((row) => row.timetableEntryId).filter(Boolean);
    if (newEntryIds.length > 0) {
      const placeholders = newEntryIds.map(() => "?").join(",");
      await connection.execute(
        `DELETE te
         FROM timetable_entry te
         LEFT JOIN attendance_record ar
           ON ar.timetable_entry_id = te.timetable_entry_id
         WHERE te.section_id = ?
           AND te.timetable_entry_id NOT IN (${placeholders})
           AND ar.timetable_entry_id IS NULL`,
        [profile.section_id, ...newEntryIds]
      );
    }

    await connection.commit();
    return {
      written: true,
      insertedEntries: entries.length,
      sectionId: profile.section_id,
      unifiedTimetableId,
      sharedBatchKey: batch
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function replaceAcademicCalendarFromAcademia(userId, rows) {
  const profile = await ensureAcademicProfileForReports(userId, []);
  if (!profile || !profile.academic_unit_id) {
    throw new Error("Academic profile must include academic_unit_id before syncing academic calendar");
  }

  const cleanRows = [];
  const seen = new Set();
  for (const row of rows || []) {
    const date = normalizeSqlDate(row?.date || row?.eventDate);
    if (!date) continue;
    const dayRaw = row?.dayOrder ?? row?.day_order;
    const dayNum = dayRaw === null || dayRaw === undefined || dayRaw === "" ? Number.NaN : Number(dayRaw);
    const dayOrder = Number.isFinite(dayNum) && dayNum >= 1 && dayNum <= 7
      ? Math.round(dayNum)
      : inferDayOrderFromLabel(row?.description || row?.eventType || "");
    const eventType = cleanLabel(row?.eventType || (dayOrder ? "day_order" : "event"), 255) || "event";
    const description = cleanLabel(row?.description || (dayOrder ? `Day Order ${dayOrder}` : "Academic event"), 255) || "Academic event";
    const academicYear = Number(String(date).slice(0, 4)) || new Date().getFullYear();

    const dedupeKey = [date, dayOrder || "", eventType.toLowerCase(), description.toLowerCase()].join("|");
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    cleanRows.push({
      calendarId: stableId("cal", profile.academic_unit_id, date, dayOrder || "", eventType, description),
      academicYear,
      date,
      dayOrder: dayOrder || null,
      eventType,
      description
    });
  }

  if (!cleanRows.length) {
    return { written: false, insertedRows: 0 };
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const incomingDates = [...new Set(cleanRows.map((row) => row.date).filter(Boolean))];
    if (incomingDates.length > 0) {
      const placeholders = incomingDates.map(() => "?").join(",");
      await connection.execute(
        `DELETE FROM academic_calendar
         WHERE academic_unit_id = ?
           AND date IN (${placeholders})`,
        [profile.academic_unit_id, ...incomingDates]
      );
    }
    for (const row of cleanRows) {
      await connection.execute(
        `INSERT INTO academic_calendar
          (calendar_id, academic_year, date, day_order, event_type, description, academic_unit_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
          academic_year = VALUES(academic_year),
          date = VALUES(date),
          day_order = VALUES(day_order),
          event_type = VALUES(event_type),
          description = VALUES(description),
          academic_unit_id = VALUES(academic_unit_id)`,
        [
          row.calendarId,
          row.academicYear,
          row.date,
          row.dayOrder,
          row.eventType,
          row.description,
          profile.academic_unit_id
        ]
      );
    }
    await connection.commit();
    return { written: true, insertedRows: cleanRows.length };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateAcademiaSyncState(userId, { status, lastError = null, checksum = null, fetchedAt = null }) {
  // Older deployments may have a shorter `last_error` column than current schema.
  // Trim defensively so scrape failures never fail the state update itself.
  const safeLastError = lastError ? String(lastError).slice(0, 240) : null;
  const safeChecksum = checksum ? String(checksum).slice(0, 64) : null;
  const safeFetchedAt = fetchedAt ? new Date(fetchedAt) : null;
  try {
    await pool.execute(
      `UPDATE academia_account
       SET status = ?,
           last_synced_at = COALESCE(?, last_synced_at),
           last_error = ?,
           last_sync_checksum = COALESCE(?, last_sync_checksum)
       WHERE user_id = ?`,
      [status, safeFetchedAt, safeLastError, safeChecksum, userId]
    );
  } catch (error) {
    if (String(error?.code || "") === "ER_BAD_FIELD_ERROR") {
      await pool.execute(
        `UPDATE academia_account
         SET status = ?,
             last_synced_at = COALESCE(?, last_synced_at),
             last_error = ?
         WHERE user_id = ?`,
        [status, safeFetchedAt, safeLastError, userId]
      );
      return;
    }
    throw error;
  }
}

async function clearAcademiaCaches(userId) {
  void userId;
}

async function clearAcademiaTimetableCache(userId) {
  void userId;
}

async function clearAcademiaMarksCache(userId) {
  void userId;
}

async function clearAcademiaAttendanceCache(userId) {
  void userId;
}

async function insertAcademiaTimetableRows(userId, rows) {
  void userId;
  void rows;
}

async function insertAcademiaMarksRows(userId, rows) {
  void userId;
  void rows;
}

async function insertAcademiaAttendanceRows(userId, rows) {
  void userId;
  void rows;
}

async function listAcademiaTimetableRows(userId) {
  const [rows] = await pool.execute(
    `SELECT
      t.timetable_entry_id AS id,
      t.day_order,
      NULL AS day_label,
      t.start_time,
      t.end_time,
      s.subject_name,
      f.faculty_name,
      c.room_number AS room_label
     FROM academic_profile ap
     JOIN timetable_entry t ON t.section_id = ap.section_id
     JOIN subject s ON s.subject_id = t.subject_id
     LEFT JOIN faculty f ON f.faculty_id = t.faculty_id
     LEFT JOIN classroom c ON c.classroom_id = t.classroom_id
     WHERE ap.user_id = ?
     ORDER BY COALESCE(t.day_order, 99), t.start_time, s.subject_name`,
    [userId]
  );

  return rows;
}

async function listAcademiaMarksRows(userId) {
  const [rows] = await pool.execute(
    `SELECT
      m.marks_id AS id,
      s.subject_name,
      m.component_type AS component_name,
      m.score,
      m.max_score,
      ROUND((m.score / NULLIF(m.max_score, 0)) * 100, 2) AS percentage
     FROM marks_record m
     JOIN subject s ON s.subject_id = m.subject_id
     WHERE m.user_id = ?
     ORDER BY s.subject_name ASC, m.recorded_at DESC`,
    [userId]
  );

  return rows;
}

async function listAcademiaAttendanceRows(userId) {
  const [rows] = await pool.execute(
    `SELECT
      CONCAT('att_', s.subject_id) AS id,
      s.subject_name,
      SUM(a.attended) AS attended_classes,
      COUNT(*) AS total_classes,
      ROUND((SUM(a.attended) / NULLIF(COUNT(*), 0)) * 100, 2) AS attendance_percentage
     FROM attendance_record a
     JOIN subject s ON s.subject_id = a.subject_id
     WHERE a.user_id = ?
     GROUP BY s.subject_id, s.subject_name
     ORDER BY s.subject_name ASC`,
    [userId]
  );

  return rows;
}

async function replaceUserAcademicRecordsFromAcademia(userId, { marksRows = [], attendanceRows = [] } = {}) {
  const profile = await ensureAcademicProfileForReports(userId, []);
  if (!profile || !profile.academic_unit_id) {
    throw new Error("Academic profile must include academic_unit_id before syncing marks/attendance");
  }

  const semesterRaw = Number(profile.current_semester);
  const normalizedSemester = Number.isFinite(semesterRaw) && semesterRaw > 0 ? Math.round(semesterRaw) : 1;
  const normalizeSubjectKey = (value) => cleanLabel(value, 255).toLowerCase();
  const subjectNames = [...new Set([
    ...(marksRows || []).map((row) => cleanLabel(row?.subjectName || row?.subject_name, 255)),
    ...(attendanceRows || []).map((row) => cleanLabel(row?.subjectName || row?.subject_name, 255))
  ].filter(Boolean))];

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const subjectIdByName = new Map();
    for (const subjectName of subjectNames) {
      const subjectId = stableId("sub", profile.academic_unit_id, normalizedSemester, subjectName);
      subjectIdByName.set(normalizeSubjectKey(subjectName), subjectId);
      await connection.execute(
        `INSERT INTO subject
          (subject_id, subject_name, credits, minimum_attendance_percentage, academic_unit_id, program, semester)
         VALUES (?, ?, NULL, NULL, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
          subject_name = VALUES(subject_name),
          academic_unit_id = VALUES(academic_unit_id),
          program = VALUES(program),
          semester = VALUES(semester)`,
        [subjectId, subjectName, profile.academic_unit_id, profile.program || null, normalizedSemester]
      );
    }

    if (Array.isArray(marksRows) && marksRows.length > 0) {
      await connection.execute(`DELETE FROM marks_record WHERE user_id = ?`, [userId]);

      for (const row of marksRows) {
        const subjectName = cleanLabel(row?.subjectName || row?.subject_name, 255);
        const subjectId = subjectIdByName.get(normalizeSubjectKey(subjectName));
        if (!subjectName || !subjectId) continue;

        const componentType = cleanLabel(row?.componentName || row?.component_name || "overall", 255) || "overall";
        const score = Number(row?.score);
        const maxScore = Number(row?.maxScore ?? row?.max_score);
        if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0 || score < 0 || score > maxScore) continue;

        const marksId = createId("mrk");
        await connection.execute(
          `INSERT INTO marks_record (marks_id, user_id, subject_id, component_type, score, max_score)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [marksId, userId, subjectId, componentType, score, maxScore]
        );
      }
    }

    if (Array.isArray(attendanceRows) && attendanceRows.length > 0) {
      await connection.execute(`DELETE FROM attendance_record WHERE user_id = ?`, [userId]);

      const [timetableRows] = await connection.execute(
        `SELECT t.subject_id, MIN(t.timetable_entry_id) AS timetable_entry_id
         FROM academic_profile ap
         JOIN timetable_entry t ON t.section_id = ap.section_id
         WHERE ap.user_id = ?
         GROUP BY t.subject_id`,
        [userId]
      );
      const timetableIdBySubjectId = new Map(
        (timetableRows || []).map((row) => [String(row.subject_id), row.timetable_entry_id || null])
      );

      const now = new Date();
      const formatDate = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      };

      for (const row of attendanceRows) {
        const subjectName = cleanLabel(row?.subjectName || row?.subject_name, 255);
        const subjectId = subjectIdByName.get(normalizeSubjectKey(subjectName));
        if (!subjectName || !subjectId) continue;

        const totalClasses = Math.max(0, Math.round(Number(row?.totalClasses ?? row?.total_classes ?? 0)));
        const attendedClasses = Math.max(0, Math.min(totalClasses, Math.round(Number(row?.attendedClasses ?? row?.attended_classes ?? 0))));
        if (totalClasses <= 0) continue;

        const timetableEntryId = timetableIdBySubjectId.get(String(subjectId)) || null;
        for (let i = 0; i < totalClasses; i += 1) {
          const classDate = new Date(now);
          classDate.setDate(now.getDate() - i);
          await connection.execute(
            `INSERT INTO attendance_record
              (attendance_id, user_id, subject_id, timetable_entry_id, class_date, attended)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [createId("att"), userId, subjectId, timetableEntryId, formatDate(classDate), i < attendedClasses ? 1 : 0]
          );
        }
      }
    }

    await connection.commit();
    return {
      marksWritten: Array.isArray(marksRows) && marksRows.length > 0,
      attendanceWritten: Array.isArray(attendanceRows) && attendanceRows.length > 0
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
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
  getCompletedWorkoutCaloriesForDate,
  updateWorkoutGoogleSync,
  createEmailEvent,
  reconcileAcademicCalendarEventDateByTitle,
  reconcileAcademicCalendarEventTitleByDate,
  getEmailEventByMessage,
  upsertAcademicEnrollment,
  listAcademicEnrollments,
  registerAcademicEnrollment,
  deleteAcademicEnrollment,
  purgeCompletedAcademicEnrollments,
  purgeCompletedAcademicEnrollmentsAll,
  purgeStaleAcademicDeadlines,
  purgeStaleAcademicDeadlinesAll,
  listCalendarEventsByUser,
  upsertCalendarEventByGoogleId,
  normalizeCalendarGoogleEventIdNamespace,
  saveAcademiaCredentials,
  getAcademiaAccount,
  listUsersWithConnectedAcademia,
  getAcademicProfileForUser,
  replaceSectionUnifiedTimetableFromAcademia,
  replaceAcademicCalendarFromAcademia,
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
  listAcademiaAttendanceRows,
  replaceUserAcademicRecordsFromAcademia
};
