const pool = require("../config/db");

async function getTimetableForUser(userId) {
  const [rows] = await pool.execute(
    `SELECT
      t.timetable_entry_id,
      t.day_order,
      t.start_time,
      t.end_time,
      s.subject_name,
      f.faculty_name,
      c.room_number,
      c.building_name
     FROM academic_profile ap
     JOIN timetable_entry t ON ap.section_id = t.section_id
     JOIN subject s ON t.subject_id = s.subject_id
     LEFT JOIN faculty f ON t.faculty_id = f.faculty_id
     LEFT JOIN classroom c ON t.classroom_id = c.classroom_id
     WHERE ap.user_id = ?
     ORDER BY t.day_order, t.start_time`,
    [userId]
  );

  return rows;
}

async function timetableEntryExists(timetableEntryId) {
  const [rows] = await pool.execute(
    `SELECT timetable_entry_id
     FROM timetable_entry
     WHERE timetable_entry_id = ?`,
    [timetableEntryId]
  );

  return rows.length > 0;
}

module.exports = {
  getTimetableForUser,
  timetableEntryExists
};
