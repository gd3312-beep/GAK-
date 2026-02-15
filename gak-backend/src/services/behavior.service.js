const { randomUUID } = require("crypto");

const behaviorModel = require("../models/behavior.model");

function isExamWeek(date) {
  const month = new Date(date).getMonth() + 1;
  return month === 4 || month === 11;
}

async function logBehavior({ userId, domain, entityId, action, timestamp = new Date(), attendancePressure = false }) {
  const t = new Date(timestamp);

  await behaviorModel.insertBehaviorLog({
    id: randomUUID(),
    userId,
    domain,
    entityId,
    action,
    timestamp: t,
    dayOfWeek: t.getDay(),
    hourOfDay: t.getHours(),
    examWeek: isExamWeek(t),
    attendancePressure
  });
}

async function getTimeline(userId, limit = 200) {
  return behaviorModel.getBehaviorTimeline(userId, limit);
}

function computeFrequencyPeak(values, key) {
  const counter = new Map();
  for (const row of values) {
    const k = Number(row[key]);
    counter.set(k, (counter.get(k) || 0) + 1);
  }
  const sorted = [...counter.entries()].sort((a, b) => b[1] - a[1]);
  return sorted.length ? sorted[0][0] : 0;
}

async function recomputeFitnessMetrics(userId) {
  const fromDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const logs = await behaviorModel.getDomainLogs(userId, "fitness", fromDate);

  if (!logs.length) {
    return;
  }

  const done = logs.filter((x) => x.action === "done").length;
  const skipped = logs.filter((x) => x.action === "skipped").length;
  const total = done + skipped;

  const examDone = logs.filter((x) => x.action === "done" && Number(x.exam_week) === 1).length;
  const normalDone = logs.filter((x) => x.action === "done" && Number(x.exam_week) === 0).length;

  const examWeekDropPercentage = normalDone > 0 ? Number((((normalDone - examDone) / normalDone) * 100).toFixed(2)) : 0;

  await behaviorModel.upsertFitnessMetrics({
    userId,
    skipRate: total > 0 ? Number((skipped / total).toFixed(4)) : 0,
    consistencyScore: done,
    bestTimeSlot: computeFrequencyPeak(logs.filter((x) => x.action === "done"), "hour_of_day"),
    worstDay: computeFrequencyPeak(logs.filter((x) => x.action === "skipped"), "day_of_week"),
    examWeekDropPercentage
  });
}

async function recomputeAcademicMetrics(userId) {
  const stats = await behaviorModel.getBaseAcademicStats(userId);
  const totalClasses = Number(stats.attendance.total_classes || 0);
  const attendedClasses = Number(stats.attendance.attended_classes || 0);
  const avgAttendance = totalClasses > 0 ? attendedClasses / totalClasses : 0;
  const riskSubjectCount = Number(stats.attendance.risk_subject_count || 0);
  const avgMarkRatio = Number(stats.marks.avg_mark_ratio || 0);

  await behaviorModel.upsertAcademicMetrics({
    userId,
    avgAttendance: Number(avgAttendance.toFixed(4)),
    riskSubjectCount,
    examWeekStressIndex: Number((riskSubjectCount * (1 - avgAttendance)).toFixed(4)),
    goalAdherenceScore: Number((avgAttendance * avgMarkRatio).toFixed(4))
  });
}

async function recomputeNutritionMetrics(userId) {
  const fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rows = await behaviorModel.getDailyNutritionTotals(userId, fromDate);

  if (!rows.length) {
    return;
  }

  const totalDays = rows.length;
  const totalCalories = rows.reduce((sum, row) => sum + Number(row.calories_total || 0), 0);
  const overLimitDays = rows.filter((row) => Number(row.calories_total || 0) > 2400).length;
  const proteinDeficitDays = rows.filter((row) => Number(row.protein_total || 0) < 60).length;

  await behaviorModel.upsertNutritionMetrics({
    userId,
    avgDailyCalories: Number((totalCalories / totalDays).toFixed(2)),
    overLimitDays,
    proteinDeficitRatio: Number((proteinDeficitDays / totalDays).toFixed(4)),
    loggingConsistency: Number((totalDays / 30).toFixed(4))
  });
}

async function recomputeAllDomainMetrics() {
  const users = await behaviorModel.listAllUsers();

  for (const user of users) {
    const userId = user.user_id;
    await recomputeFitnessMetrics(userId);
    await recomputeAcademicMetrics(userId);
    await recomputeNutritionMetrics(userId);
  }

  return { usersProcessed: users.length };
}

module.exports = {
  logBehavior,
  getTimeline,
  recomputeFitnessMetrics,
  recomputeAcademicMetrics,
  recomputeNutritionMetrics,
  recomputeAllDomainMetrics
};
