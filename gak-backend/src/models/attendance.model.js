const pool = require("../config/db");

async function createAttendanceRecord({ attendanceId, userId, subjectId, timetableEntryId, classDate, attended }) {
  await pool.execute(
    `INSERT INTO attendance_record
      (attendance_id, user_id, subject_id, timetable_entry_id, class_date, attended)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [attendanceId, userId, subjectId, timetableEntryId, classDate, attended ? 1 : 0]
  );
}

async function getAttendanceSummaryByUser(userId) {
  const [rows] = await pool.execute(
    `SELECT 
      a.user_id,
      s.subject_id,
      s.subject_name,
      COUNT(*) AS total_classes,
      SUM(a.attended) AS attended_classes,
      ROUND((SUM(a.attended) / COUNT(*)) * 100, 2) AS attendance_percentage
     FROM attendance_record a
     JOIN subject s ON a.subject_id = s.subject_id
     WHERE a.user_id = ?
     GROUP BY a.user_id, s.subject_id, s.subject_name
     ORDER BY s.subject_name ASC`,
    [userId]
  );

  return rows;
}

async function getMonthlyAttendanceTrend(userId) {
  const [rows] = await pool.execute(
    `SELECT
      DATE_FORMAT(class_date, '%Y-%m') AS month,
      COUNT(*) AS total_classes,
      SUM(attended) AS attended_classes,
      ROUND((SUM(attended) / COUNT(*)) * 100, 2) AS attendance_percentage
     FROM attendance_record
     WHERE user_id = ?
     GROUP BY DATE_FORMAT(class_date, '%Y-%m')
     ORDER BY month`,
    [userId]
  );

  return rows;
}

module.exports = {
  createAttendanceRecord,
  getAttendanceSummaryByUser,
  getMonthlyAttendanceTrend
};
