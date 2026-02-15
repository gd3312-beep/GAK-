const pool = require("../config/db");

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

module.exports = {
  findByEmail,
  createUser,
  findById
};
