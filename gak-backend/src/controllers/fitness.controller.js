const { randomUUID } = require("crypto");
const path = require("path");
const fs = require("fs/promises");
let pdfParse = null;
try {
  pdfParse = require("pdf-parse");
} catch (_error) {
  pdfParse = null;
}

const workoutModel = require("../models/workout.model");
const workoutPlanModel = require("../models/workout-plan.model");
const analyticsService = require("../services/analytics.service");
const behaviorService = require("../services/behavior.service");
const integrationService = require("../services/integration.service");
const { parseWorkoutPlanPdf } = require("../utils/workout-plan.util");

function ensureSelf(req, res, paramName = "userId") {
  const paramValue = req.params?.[paramName];
  if (paramValue && paramValue !== req.user.userId) {
    res.status(403).json({ message: "Forbidden" });
    return false;
  }
  return true;
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

async function createWorkoutSession(req, res, next) {
  try {
    const { workoutDate, workoutType, muscleGroup, durationMinutes, caloriesBurned, planId } = req.body;

    if (!workoutDate || !workoutType || !muscleGroup) {
      return res.status(400).json({ message: "workoutDate, workoutType, muscleGroup are required" });
    }

    const sessionId = randomUUID();

    const session = await workoutModel.createWorkoutSession({
      sessionId,
      userId: req.user.userId,
      workoutDate,
      workoutType,
      muscleGroup,
      durationMinutes: Number(durationMinutes || 30),
      caloriesBurned: Number(caloriesBurned || 0),
      planId: planId || null
    });

    return res.status(201).json(session);
  } catch (error) {
    return next(error);
  }
}

async function updateWorkoutAction(req, res, next) {
  try {
    const { sessionId, status } = req.body;

    if (!sessionId || !status) {
      return res.status(400).json({ message: "sessionId and status are required" });
    }

    const normalized = String(status).toLowerCase();

    if (!["done", "completed", "skipped"].includes(normalized)) {
      return res.status(400).json({ message: "status must be one of: done, completed, skipped" });
    }

    const exists = await workoutModel.sessionExistsForUser(sessionId, req.user.userId);

    if (!exists) {
      return res.status(400).json({ message: "Invalid session_id: session does not exist for user" });
    }

    const actionId = await workoutModel.upsertWorkoutAction({
      actionId: randomUUID(),
      sessionId,
      userId: req.user.userId,
      status
    });

    const actionType = normalized === "skipped" ? "skipped" : "done";

    await behaviorService.logBehavior({
      userId: req.user.userId,
      domain: "fitness",
      entityId: sessionId,
      action: actionType
    });

    if (actionType === "done") {
      await integrationService.pushWorkoutToGoogleFit(req.user.userId, sessionId);
    }

    return res.status(200).json({ message: "Workout action recorded", actionId });
  } catch (error) {
    return next(error);
  }
}

async function getFitnessSummary(req, res, next) {
  try {
    const { userId } = req.params;
    if (!ensureSelf(req, res, "userId")) return;
    const summary = await analyticsService.getFitnessSummary(userId);
    return res.status(200).json(summary);
  } catch (error) {
    return next(error);
  }
}

async function getFitDaily(req, res, next) {
  try {
    const requestDate = req.query.date || new Date().toISOString().slice(0, 10);
    const date = isIsoDate(requestDate) ? requestDate : new Date().toISOString().slice(0, 10);
    const result = await integrationService.getFitDailyMetrics(req.user.userId, date);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function getFitRange(req, res, next) {
  try {
    const from = req.query.from;
    if (!from || !isIsoDate(from)) {
      return res.status(400).json({ message: "from (YYYY-MM-DD) is required" });
    }
    const rows = await integrationService.listFitMetricsRange(req.user.userId, from);
    return res.status(200).json({ from: String(from).slice(0, 10), rows });
  } catch (error) {
    return next(error);
  }
}

function safeTime(value) {
  if (!value) return null;
  const text = String(value);
  const m = text.match(/^(\d{2}):(\d{2}):(\d{2})$/);
  return m ? text : null;
}

function diffMinutes(startTime, endTime) {
  const s = safeTime(startTime);
  const e = safeTime(endTime);
  if (!s || !e) return null;
  const [sh, sm] = s.split(":").map((x) => Number(x));
  const [eh, em] = e.split(":").map((x) => Number(x));
  if (![sh, sm, eh, em].every((n) => Number.isFinite(n))) return null;
  let start = sh * 60 + sm;
  let end = eh * 60 + em;
  if (end < start) end += 24 * 60;
  return Math.max(1, end - start);
}

function dayLabelMatchesDate(label, dateObj) {
  const raw = String(label || "").toLowerCase().trim();
  if (!raw) {
    return false;
  }

  const day = dateObj.getDay(); // 0=Sun, 1=Mon, ... 6=Sat
  const mondayOrder = day === 0 ? 7 : day; // 1=Mon ... 7=Sun

  const weekdayMatchers = [
    { re: /\bmon(day)?\b/i, order: 1 },
    { re: /\btue(s|sday)?\b/i, order: 2 },
    { re: /\bwed(nesday)?\b/i, order: 3 },
    { re: /\bthu(r|rs|rsday)?\b/i, order: 4 },
    { re: /\bfri(day)?\b/i, order: 5 },
    { re: /\bsat(urday)?\b/i, order: 6 },
    { re: /\bsun(day)?\b/i, order: 7 }
  ];

  if (weekdayMatchers.some((matcher) => matcher.order === mondayOrder && matcher.re.test(raw))) {
    return true;
  }

  const dayOrderMatch = raw.match(/\bday\s*([1-7])\b/i);
  if (dayOrderMatch && Number(dayOrderMatch[1]) === mondayOrder) {
    return true;
  }

  const standaloneNumber = raw.match(/\b([1-7])\b/);
  if (standaloneNumber && Number(standaloneNumber[1]) === mondayOrder) {
    return true;
  }

  return false;
}

function filterExercisesForDate(exercises, dateObj) {
  const list = Array.isArray(exercises) ? exercises : [];
  const hasDayLabels = list.some((item) => String(item?.day_label || "").trim().length > 0);

  if (!hasDayLabels) {
    return {
      hasDayLabels: false,
      isScheduledForDay: list.length > 0,
      exercisesForDay: list
    };
  }

  const exercisesForDay = list.filter((item) => dayLabelMatchesDate(item?.day_label, dateObj));
  return {
    hasDayLabels: true,
    isScheduledForDay: exercisesForDay.length > 0,
    exercisesForDay
  };
}

async function uploadWorkoutPlan(req, res, next) {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ message: "PDF file is required" });
    }

    if (!pdfParse) {
      return res.status(400).json({ message: "pdf-parse is not installed on backend" });
    }

    const planId = randomUUID();
    const userId = req.user.userId;
    const original = String(req.file.originalname || "workout-plan.pdf");

    const parsed = await parseWorkoutPlanPdf({
      pdfParse,
      buffer: req.file.buffer,
      fileName: original
    });

    const uploadsRoot = path.join(__dirname, "..", "..", "uploads", "workout-plans", userId);
    await fs.mkdir(uploadsRoot, { recursive: true });
    const fileName = `${planId}.pdf`;
    const absPath = path.join(uploadsRoot, fileName);
    await fs.writeFile(absPath, req.file.buffer);
    const filePath = path.posix.join("workout-plans", userId, fileName);

    try {
      await workoutPlanModel.createWorkoutPlan({
        planId,
        userId,
        source: "pdf",
        planName: parsed.planName || null,
        startTime: parsed.startTime || null,
        endTime: parsed.endTime || null,
        filePath
      });
    } catch (dbError) {
      // Likely missing migration columns/tables.
      if (dbError && (dbError.code === "ER_BAD_FIELD_ERROR" || dbError.code === "ER_NO_SUCH_TABLE")) {
        return res.status(400).json({ message: "Workout plan tables not ready. Apply SQL migration 09_workout_plan_details.sql." });
      }
      throw dbError;
    }

    const exercises = (parsed.exercises || []).map((ex, idx) => ({
      exerciseId: randomUUID(),
      dayLabel: null,
      sortOrder: ex.sortOrder === undefined || ex.sortOrder === null ? idx : Number(ex.sortOrder),
      exerciseName: ex.exerciseName,
      sets: ex.sets === undefined ? null : ex.sets,
      reps: ex.reps || null
    }));

    try {
      await workoutPlanModel.insertPlanExercises(planId, exercises);
    } catch (dbError) {
      if (dbError && dbError.code === "ER_NO_SUCH_TABLE") {
        return res.status(400).json({ message: "Workout plan exercise table not found. Apply SQL migration 09_workout_plan_details.sql." });
      }
      throw dbError;
    }

    return res.status(201).json({
      planId,
      planName: parsed.planName || null,
      startTime: parsed.startTime || null,
      endTime: parsed.endTime || null,
      exerciseCount: exercises.length,
      preview: exercises.slice(0, 12)
    });
  } catch (error) {
    return next(error);
  }
}

async function getCurrentWorkoutPlan(req, res, next) {
  try {
    const plan = await workoutPlanModel.getLatestWorkoutPlan(req.user.userId);
    if (!plan) {
      return res.status(200).json({ hasPlan: false });
    }

    let exercises = [];
    try {
      exercises = await workoutPlanModel.listPlanExercises(plan.plan_id);
    } catch (dbError) {
      if (dbError && dbError.code === "ER_NO_SUCH_TABLE") {
        exercises = [];
      } else {
        throw dbError;
      }
    }

    return res.status(200).json({
      hasPlan: true,
      plan: {
        planId: plan.plan_id,
        source: plan.source,
        planName: plan.plan_name || null,
        startTime: plan.schedule_start_time ? String(plan.schedule_start_time) : null,
        endTime: plan.schedule_end_time ? String(plan.schedule_end_time) : null,
        filePath: plan.file_path || null,
        createdAt: plan.created_at
      },
      exercises
    });
  } catch (error) {
    return next(error);
  }
}

async function getTodayWorkoutPlan(req, res, next) {
  try {
    const date = String(req.query.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const dateObj = new Date(`${date}T00:00:00`);

    const plan = await workoutPlanModel.getLatestWorkoutPlan(req.user.userId);
    if (!plan) {
      return res.status(200).json({ date, hasPlan: false, isScheduledForDay: false, session: null, exercises: [] });
    }

    let exercises = [];
    try {
      exercises = await workoutPlanModel.listPlanExercises(plan.plan_id);
    } catch (dbError) {
      if (dbError && dbError.code === "ER_NO_SUCH_TABLE") {
        exercises = [];
      } else {
        throw dbError;
      }
    }

    const schedule = filterExercisesForDate(exercises, dateObj);

    const session = await workoutModel.getSessionByUserAndDate(req.user.userId, date);
    const action = session ? await workoutModel.getActionForSession(req.user.userId, session.session_id) : null;
    const statusRaw = action?.status ? String(action.status).toLowerCase() : null;
    const status = statusRaw === "skipped" ? "skipped" : statusRaw === "done" || statusRaw === "completed" ? "done" : "pending";

    return res.status(200).json({
      date,
      hasPlan: true,
      isScheduledForDay: schedule.isScheduledForDay,
      plan: {
        planId: plan.plan_id,
        planName: plan.plan_name || null,
        startTime: plan.schedule_start_time ? String(plan.schedule_start_time) : null,
        endTime: plan.schedule_end_time ? String(plan.schedule_end_time) : null
      },
      exercises: schedule.exercisesForDay,
      session: session
        ? {
            sessionId: session.session_id,
            status,
            performedAt: action?.performed_at || null
          }
        : { sessionId: null, status: "pending", performedAt: null }
    });
  } catch (error) {
    return next(error);
  }
}

async function setTodayWorkoutAction(req, res, next) {
  try {
    const rawDate = String(req.body.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const date = isIsoDate(rawDate) ? rawDate : new Date().toISOString().slice(0, 10);
    const dateObj = new Date(`${date}T00:00:00`);
    const status = String(req.body.status || "").toLowerCase();

    if (!["done", "completed", "skipped"].includes(status)) {
      return res.status(400).json({ message: "status must be one of: done, completed, skipped" });
    }

    const plan = await workoutPlanModel.getLatestWorkoutPlan(req.user.userId);
    if (!plan) {
      return res.status(400).json({ message: "No workout plan found. Upload a plan PDF first." });
    }

    let exercises = [];
    try {
      exercises = await workoutPlanModel.listPlanExercises(plan.plan_id);
    } catch (dbError) {
      if (dbError && dbError.code === "ER_NO_SUCH_TABLE") {
        exercises = [];
      } else {
        throw dbError;
      }
    }

    const schedule = filterExercisesForDate(exercises, dateObj);
    if (!schedule.isScheduledForDay) {
      return res.status(400).json({ message: "No workout is scheduled for this day." });
    }

    let session = await workoutModel.getSessionByUserAndDate(req.user.userId, date);

    if (!session) {
      const planName = plan.plan_name ? String(plan.plan_name) : "Workout";
      const durationMinutes = diffMinutes(plan.schedule_start_time, plan.schedule_end_time) || 90;

      const sessionId = randomUUID();
      session = await workoutModel.createWorkoutSession({
        sessionId,
        userId: req.user.userId,
        workoutDate: date,
        workoutType: "strength",
        muscleGroup: planName,
        durationMinutes,
        caloriesBurned: 0,
        planId: plan.plan_id
      });
      session = { session_id: sessionId };
    }

    const actionId = await workoutModel.upsertWorkoutAction({
      actionId: randomUUID(),
      sessionId: session.session_id,
      userId: req.user.userId,
      status
    });

    const actionType = status === "skipped" ? "skipped" : "done";
    await behaviorService.logBehavior({
      userId: req.user.userId,
      domain: "fitness",
      entityId: session.session_id,
      action: actionType
    });

    if (actionType === "done") {
      await integrationService.pushWorkoutToGoogleFit(req.user.userId, session.session_id);
    }

    return res.status(200).json({ date, sessionId: session.session_id, actionId, status: actionType });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createWorkoutSession,
  updateWorkoutAction,
  getFitnessSummary,
  getFitDaily,
  getFitRange,
  uploadWorkoutPlan,
  getCurrentWorkoutPlan,
  getTodayWorkoutPlan,
  setTodayWorkoutAction
};
