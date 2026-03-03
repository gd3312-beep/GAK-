const subjectModel = require("../models/subject.model");
const timetableModel = require("../models/timetable.model");
const attendanceService = require("../services/attendance.service");
const marksService = require("../services/marks.service");
const behaviorService = require("../services/behavior.service");

function ensureSelf(req, res, paramName = "userId") {
  const paramValue = req.params?.[paramName];
  if (paramValue && paramValue !== req.user.userId) {
    res.status(403).json({ message: "Forbidden" });
    return false;
  }
  return true;
}

async function getSubjects(_req, res, next) {
  try {
    const rows = await subjectModel.getAllSubjects();
    return res.status(200).json(rows);
  } catch (error) {
    return next(error);
  }
}

async function getTimetable(req, res, next) {
  try {
    const { userId } = req.params;
    if (!ensureSelf(req, res, "userId")) return;
    const rows = await timetableModel.getTimetableForUser(userId);
    return res.status(200).json(rows);
  } catch (error) {
    return next(error);
  }
}

async function getCurrentDayOrder(req, res, next) {
  try {
    const { userId } = req.params;
    if (!ensureSelf(req, res, "userId")) return;
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });

    const now = new Date();
    const dateIso = formatter.format(now);
    const tomorrowIso = formatter.format(new Date(now.getTime() + 24 * 60 * 60 * 1000));

    const dayOrder = await timetableModel.getDayOrderForDate(userId, dateIso);
    const tomorrowStatus = await timetableModel.getAcademicCalendarStatusForDate(userId, tomorrowIso);
    const tomorrowFallbackDayOrder = await timetableModel.getDayOrderForDate(userId, tomorrowIso);
    const tomorrowDayOrder = tomorrowStatus.dayOrder ?? tomorrowFallbackDayOrder;
    const tomorrow = {
      date: tomorrowIso,
      dayOrder: tomorrowDayOrder,
      isHoliday: Boolean(tomorrowStatus.isHoliday),
      holidayDescription: tomorrowStatus.holidayDescription || null,
      source: tomorrowStatus.source || "unavailable"
    };

    if (dayOrder) {
      return res.status(200).json({
        date: dateIso,
        dayOrder,
        source: "academic_calendar",
        tomorrow
      });
    }

    const weekday = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      weekday: "short"
    }).format(now).toLowerCase();
    const weekdayMap = {
      mon: 1,
      tue: 2,
      wed: 3,
      thu: 4,
      fri: 5
    };
    const fallbackDayOrder = Object.prototype.hasOwnProperty.call(weekdayMap, weekday)
      ? weekdayMap[weekday]
      : null;

    return res.status(200).json({
      date: dateIso,
      dayOrder: fallbackDayOrder,
      source: fallbackDayOrder ? "weekday_estimate" : "unavailable",
      tomorrow
    });
  } catch (error) {
    return next(error);
  }
}

async function postAttendance(req, res, next) {
  try {
    const { subjectId, timetableEntryId, classDate, attended } = req.body;

    if (!subjectId || typeof attended !== "boolean" || !classDate) {
      return res.status(400).json({ message: "subjectId, classDate and attended(boolean) are required" });
    }

    const result = await attendanceService.markAttendance({
      userId: req.user.userId,
      subjectId,
      timetableEntryId,
      classDate,
      attended
    });

    await behaviorService.logBehavior({
      userId: req.user.userId,
      domain: "academic",
      entityId: result.attendanceId,
      action: attended ? "done" : "missed",
      attendancePressure: !attended
    });

    return res.status(201).json(result);
  } catch (error) {
    if (error.message.startsWith("Invalid")) {
      return res.status(400).json({ message: error.message });
    }

    return next(error);
  }
}

async function getAttendanceSummary(req, res, next) {
  try {
    const { userId } = req.params;
    if (!ensureSelf(req, res, "userId")) return;
    const summary = await attendanceService.getAttendanceSummary(userId);
    return res.status(200).json(summary);
  } catch (error) {
    return next(error);
  }
}

async function postMarks(req, res, next) {
  try {
    const { subjectId, componentType, score, maxScore } = req.body;

    if (!subjectId || !componentType || score === undefined || maxScore === undefined) {
      return res.status(400).json({ message: "subjectId, componentType, score, maxScore are required" });
    }

    const result = await marksService.addMarks({
      userId: req.user.userId,
      subjectId,
      componentType,
      score: Number(score),
      maxScore: Number(maxScore)
    });

    await behaviorService.logBehavior({
      userId: req.user.userId,
      domain: "academic",
      entityId: result.marksId,
      action: "submitted"
    });

    return res.status(201).json(result);
  } catch (error) {
    if (error.message.startsWith("Invalid") || error.message.includes("must")) {
      return res.status(400).json({ message: error.message });
    }

    return next(error);
  }
}

async function getPerformance(req, res, next) {
  try {
    const { userId } = req.params;
    if (!ensureSelf(req, res, "userId")) return;
    const rows = await marksService.getPerformance(userId);
    return res.status(200).json(rows);
  } catch (error) {
    return next(error);
  }
}

async function getMarks(req, res, next) {
  try {
    const { userId } = req.params;
    if (!ensureSelf(req, res, "userId")) return;
    const rows = await marksService.listMarks(userId);
    return res.status(200).json(rows);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getSubjects,
  getTimetable,
  getCurrentDayOrder,
  postAttendance,
  getAttendanceSummary,
  postMarks,
  getPerformance,
  getMarks
};
