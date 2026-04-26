const pool = require("../config/db");
const { createId } = require("../utils/id.util");

const MAX_ACTIVE_SESSIONS = Math.max(1, Number(process.env.MAX_ACTIVE_SESSIONS || 3));

function nowPlusHours(hours) {
  return new Date(Date.now() + Math.max(1, Number(hours || 1)) * 60 * 60 * 1000);
}

function normalizeDeviceName(value) {
  const text = String(value || "").trim();
  if (!text) return "Unknown Device";
  return text.slice(0, 128);
}

function normalizeDeviceId(value) {
  const text = String(value || "").trim();
  if (!text) return "web";
  return text.slice(0, 128);
}

function normalizeIpAddress(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  return text.slice(0, 64);
}

async function createSession({ userId, deviceId, deviceName, userAgent, ipAddress, ttlHours }) {
  const connection = await pool.getConnection();
  const expiresAt = nowPlusHours(ttlHours || process.env.AUTH_SESSION_TTL_HOURS || 24 * 30);
  try {
    await connection.beginTransaction();

    const [activeRows] = await connection.execute(
      `SELECT session_id, created_at
       FROM user_session
       WHERE user_id = ?
         AND revoked_at IS NULL
         AND expires_at > NOW()
       ORDER BY last_seen_at ASC, created_at ASC
       FOR UPDATE`,
      [userId]
    );

    const overflow = Math.max(0, activeRows.length - (MAX_ACTIVE_SESSIONS - 1));
    for (let i = 0; i < overflow; i += 1) {
      await connection.execute(
        `UPDATE user_session
         SET revoked_at = NOW(), revoked_reason = 'device_limit'
         WHERE session_id = ?`,
        [activeRows[i].session_id]
      );
    }

    const sessionId = createId("ses");
    await connection.execute(
      `INSERT INTO user_session (
        session_id,
        user_id,
        device_id,
        device_name,
        user_agent,
        ip_address,
        expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        sessionId,
        userId,
        normalizeDeviceId(deviceId),
        normalizeDeviceName(deviceName),
        String(userAgent || "").slice(0, 512) || null,
        normalizeIpAddress(ipAddress),
        expiresAt
      ]
    );

    await connection.commit();
    return {
      sessionId,
      expiresAt: expiresAt.toISOString()
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getSessionById(sessionId) {
  const [rows] = await pool.execute(
    `SELECT session_id, user_id, device_id, device_name, expires_at, revoked_at, created_at, last_seen_at
     FROM user_session
     WHERE session_id = ?
     LIMIT 1`,
    [sessionId]
  );
  return rows[0] || null;
}

async function touchSession(sessionId) {
  await pool.execute(
    `UPDATE user_session
     SET last_seen_at = NOW()
     WHERE session_id = ?
       AND revoked_at IS NULL
       AND expires_at > NOW()
       AND last_seen_at < (NOW() - INTERVAL 5 MINUTE)`,
    [sessionId]
  );
}

async function revokeSession({ sessionId, userId, reason = "logout" }) {
  await pool.execute(
    `UPDATE user_session
     SET revoked_at = NOW(), revoked_reason = ?
     WHERE session_id = ?
       AND user_id = ?
       AND revoked_at IS NULL`,
    [String(reason || "logout").slice(0, 64), sessionId, userId]
  );
}

async function revokeAllSessionsForUser(userId, reason = "account_deleted") {
  await pool.execute(
    `UPDATE user_session
     SET revoked_at = NOW(), revoked_reason = ?
     WHERE user_id = ?
       AND revoked_at IS NULL`,
    [String(reason || "account_deleted").slice(0, 64), userId]
  );
}

async function listSessionsForUser(userId) {
  const [rows] = await pool.execute(
    `SELECT
      session_id AS sessionId,
      device_id AS deviceId,
      device_name AS deviceName,
      user_agent AS userAgent,
      ip_address AS ipAddress,
      created_at AS createdAt,
      last_seen_at AS lastSeenAt,
      expires_at AS expiresAt,
      revoked_at AS revokedAt,
      revoked_reason AS revokedReason
     FROM user_session
     WHERE user_id = ?
     ORDER BY (revoked_at IS NULL) DESC, last_seen_at DESC, created_at DESC`,
    [userId]
  );
  return rows;
}

module.exports = {
  MAX_ACTIVE_SESSIONS,
  createSession,
  getSessionById,
  touchSession,
  revokeSession,
  revokeAllSessionsForUser,
  listSessionsForUser
};
