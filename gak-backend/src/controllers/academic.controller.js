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
  postAttendance,
  getAttendanceSummary,
  postMarks,
  getPerformance,
  getMarks
};
