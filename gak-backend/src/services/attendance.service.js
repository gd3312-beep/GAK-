const { randomUUID } = require("crypto");

const attendanceModel = require("../models/attendance.model");
const subjectModel = require("../models/subject.model");
const timetableModel = require("../models/timetable.model");

async function markAttendance({ userId, subjectId, timetableEntryId, classDate, attended }) {
  const subjectExists = await subjectModel.existsById(subjectId);

  if (!subjectExists) {
    throw new Error("Invalid subject_id: subject does not exist");
  }

  if (timetableEntryId) {
    const entryExists = await timetableModel.timetableEntryExists(timetableEntryId);
    if (!entryExists) {
      throw new Error("Invalid timetable_entry_id: timetable entry does not exist");
    }
  }

  const attendanceId = randomUUID();

  await attendanceModel.createAttendanceRecord({
    attendanceId,
    userId,
    subjectId,
    timetableEntryId: timetableEntryId || null,
    classDate,
    attended
  });

  return { attendanceId };
}

async function getAttendanceSummary(userId) {
  const bySubject = await attendanceModel.getAttendanceSummaryByUser(userId);
  const monthlyTrend = await attendanceModel.getMonthlyAttendanceTrend(userId);

  return {
    bySubject,
    monthlyTrend
  };
}

module.exports = {
  markAttendance,
  getAttendanceSummary
};
