const pool = require("../config/db");

function isMissingView(error) {
  return String(error?.code || "") === "ER_NO_SUCH_TABLE";
}

async function queryNormalizedTimetable(userId) {
  try {
    const [rows] = await pool.execute(
      `SELECT
        timetable_entry_id,
        day_order,
        day_label,
        start_time,
        end_time,
        subject_name,
        faculty_name,
        room_number,
        building_name
       FROM v_student_timetable
       WHERE user_id = ?
       ORDER BY day_order IS NULL, day_order, start_time`,
      [userId]
    );
    return rows;
  } catch (error) {
    if (!isMissingView(error)) {
      throw error;
    }
    const [rows] = await pool.execute(
      `SELECT
        t.timetable_entry_id,
        t.day_order,
        NULL AS day_label,
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
       ORDER BY t.day_order IS NULL, t.day_order, t.start_time`,
      [userId]
    );
    return rows;
  }
}

async function getTimetableForUser(userId) {
  return queryNormalizedTimetable(userId);
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

async function getDayOrderForDate(userId, dateIso) {
  let rows;
  try {
    [rows] = await pool.execute(
      `SELECT dom.day_order
       FROM academic_profile ap
       JOIN day_order_mapping dom
         ON dom.academic_unit_id = ap.academic_unit_id
       WHERE ap.user_id = ?
         AND dom.calendar_date = ?
         AND dom.day_order IS NOT NULL
       ORDER BY dom.mapping_id DESC
       LIMIT 1`,
      [userId, dateIso]
    );
  } catch (error) {
    if (!isMissingView(error)) {
      throw error;
    }
    [rows] = await pool.execute(
      `SELECT ac.day_order
       FROM academic_profile ap
       JOIN academic_calendar ac
         ON ac.academic_unit_id = ap.academic_unit_id
       WHERE ap.user_id = ?
         AND ac.date = ?
         AND ac.day_order IS NOT NULL
       ORDER BY ac.calendar_id DESC
       LIMIT 1`,
      [userId, dateIso]
    );
  }
  const numeric = Number(rows[0]?.day_order);
  if (!Number.isFinite(numeric) || numeric < 1 || numeric > 7) return null;
  return Math.round(numeric);
}

function isHolidayEventType(eventType, description) {
  const text = `${String(eventType || "")} ${String(description || "")}`.toLowerCase();
  if (!text.trim()) return false;
  return (
    text.includes("holiday")
    || text.includes("vacation")
    || text.includes("no class")
    || text.includes("no classes")
    || text.includes("closed")
  );
}

async function getAcademicCalendarStatusForDate(userId, dateIso) {
  let rows;
  try {
    [rows] = await pool.execute(
      `SELECT ac.day_order, ac.event_type, ac.description
       FROM academic_profile ap
       JOIN academic_calendar ac
         ON ac.academic_unit_id = ap.academic_unit_id
       WHERE ap.user_id = ?
         AND ac.date = ?
       ORDER BY ac.calendar_id DESC`,
      [userId, dateIso]
    );
  } catch (error) {
    if (!isMissingView(error)) {
      throw error;
    }
    return {
      dayOrder: null,
      isHoliday: false,
      holidayDescription: null,
      source: "unavailable"
    };
  }

  const dayOrderRaw = rows.find((row) => {
    const value = Number(row?.day_order);
    return Number.isFinite(value) && value >= 1 && value <= 7;
  })?.day_order;
  const dayOrderNum = Number(dayOrderRaw);
  const dayOrder = Number.isFinite(dayOrderNum) && dayOrderNum >= 1 && dayOrderNum <= 7
    ? Math.round(dayOrderNum)
    : null;

  const holidayRow = rows.find((row) => isHolidayEventType(row?.event_type, row?.description)) || null;
  const holidayDescription = holidayRow ? String(holidayRow.description || "").trim() || null : null;

  return {
    dayOrder,
    isHoliday: Boolean(holidayRow),
    holidayDescription,
    source: rows.length > 0 ? "academic_calendar" : "unavailable"
  };
}

module.exports = {
  getTimetableForUser,
  timetableEntryExists,
  getDayOrderForDate,
  getAcademicCalendarStatusForDate
};
