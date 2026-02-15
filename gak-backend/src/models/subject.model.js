const pool = require("../config/db");

async function getAllSubjects() {
  const [rows] = await pool.execute(
    `SELECT subject_id, subject_name, credits, minimum_attendance_percentage, program, semester
     FROM subject
     ORDER BY subject_name ASC`
  );

  return rows;
}

async function existsById(subjectId) {
  const [rows] = await pool.execute(
    `SELECT subject_id
     FROM subject
     WHERE subject_id = ?`,
    [subjectId]
  );

  return rows.length > 0;
}

module.exports = {
  getAllSubjects,
  existsById
};
