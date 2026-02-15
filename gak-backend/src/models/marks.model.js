const pool = require("../config/db");

async function createMarksRecord({ marksId, userId, subjectId, componentType, score, maxScore }) {
  await pool.execute(
    `INSERT INTO marks_record
      (marks_id, user_id, subject_id, component_type, score, max_score)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [marksId, userId, subjectId, componentType, score, maxScore]
  );
}

async function getUserSectionId(userId) {
  const [rows] = await pool.execute(
    `SELECT section_id
     FROM academic_profile
     WHERE user_id = ?
     LIMIT 1`,
    [userId]
  );

  return rows[0]?.section_id || null;
}

async function getPerformanceByUser(userId) {
  const sectionId = await getUserSectionId(userId);

  // If the user is mapped to a section, compute standing within that section.
  if (sectionId) {
    const [rows] = await pool.execute(
      `WITH section_users AS (
        SELECT user_id
        FROM academic_profile
        WHERE section_id = ?
      ),
      subject_avgs AS (
        SELECT
          m.user_id,
          m.subject_id,
          AVG((m.score / NULLIF(m.max_score, 0)) * 100) AS avg_pct,
          COUNT(*) AS components_count
        FROM marks_record m
        JOIN section_users su ON su.user_id = m.user_id
        GROUP BY m.user_id, m.subject_id
      ),
      ranked AS (
        SELECT
          subject_id,
          user_id,
          ROUND(avg_pct, 2) AS average_percentage,
          components_count,
          RANK() OVER (PARTITION BY subject_id ORDER BY avg_pct DESC) AS section_rank,
          COUNT(*) OVER (PARTITION BY subject_id) AS class_size
        FROM subject_avgs
      )
      SELECT
        s.subject_id,
        s.subject_name,
        r.average_percentage,
        r.components_count,
        r.section_rank,
        r.class_size,
        GREATEST(1, ROUND((r.section_rank / NULLIF(r.class_size, 0)) * 100)) AS top_percent
      FROM ranked r
      JOIN subject s ON r.subject_id = s.subject_id
      WHERE r.user_id = ?
      ORDER BY r.average_percentage DESC`,
      [sectionId, userId]
    );

    return rows;
  }

  // Fallback: compute standing across all users in the database.
  const [rows] = await pool.execute(
    `WITH subject_avgs AS (
      SELECT
        m.user_id,
        m.subject_id,
        AVG((m.score / NULLIF(m.max_score, 0)) * 100) AS avg_pct,
        COUNT(*) AS components_count
      FROM marks_record m
      GROUP BY m.user_id, m.subject_id
    ),
    ranked AS (
      SELECT
        subject_id,
        user_id,
        ROUND(avg_pct, 2) AS average_percentage,
        components_count,
        RANK() OVER (PARTITION BY subject_id ORDER BY avg_pct DESC) AS section_rank,
        COUNT(*) OVER (PARTITION BY subject_id) AS class_size
      FROM subject_avgs
    )
    SELECT
      s.subject_id,
      s.subject_name,
      r.average_percentage,
      r.components_count,
      r.section_rank,
      r.class_size,
      GREATEST(1, ROUND((r.section_rank / NULLIF(r.class_size, 0)) * 100)) AS top_percent
    FROM ranked r
    JOIN subject s ON r.subject_id = s.subject_id
    WHERE r.user_id = ?
    ORDER BY r.average_percentage DESC`,
    [userId]
  );

  return rows;
}

async function listMarksByUser(userId) {
  const [rows] = await pool.execute(
    `SELECT
      m.marks_id,
      m.user_id,
      m.subject_id,
      s.subject_name,
      m.component_type,
      m.score,
      m.max_score,
      m.recorded_at
     FROM marks_record m
     JOIN subject s ON m.subject_id = s.subject_id
     WHERE m.user_id = ?
     ORDER BY s.subject_name, m.recorded_at DESC`,
    [userId]
  );

  return rows;
}

module.exports = {
  createMarksRecord,
  getPerformanceByUser,
  listMarksByUser
};
