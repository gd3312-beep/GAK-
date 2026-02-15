const { randomUUID } = require("crypto");

const behaviorModel = require("../models/behavior.model");

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function computeScoreIndexes(metrics) {
  const academicScoreIndex = metrics.academic ? Number((Number(metrics.academic.goal_adherence_score) * 100).toFixed(2)) : 0;
  const fitnessDisciplineIndex = metrics.fitness ? Number(((1 - Number(metrics.fitness.skip_rate)) * 100).toFixed(2)) : 0;
  const nutritionBalanceIndex = metrics.nutrition
    ? Number((100 - Number(metrics.nutrition.protein_deficit_ratio) * 100 - Number(metrics.nutrition.over_limit_days || 0)).toFixed(2))
    : 0;

  return {
    academicScoreIndex: clamp(academicScoreIndex, 0, 100),
    fitnessDisciplineIndex: clamp(fitnessDisciplineIndex, 0, 100),
    nutritionBalanceIndex: clamp(nutritionBalanceIndex, 0, 100)
  };
}

function resolveRange(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "month") {
    return { key: "month", days: 30 };
  }
  if (normalized === "year") {
    return { key: "year", days: 365 };
  }
  return { key: "all", days: null };
}

function sinceDateIso(days) {
  if (!days) {
    return null;
  }
  const dt = new Date();
  dt.setDate(dt.getDate() - Number(days));
  return dt.toISOString().slice(0, 10);
}

function computeScoreIndexesFromRange({ subjectSignals, attendanceSnapshot, workoutSnapshot, nutritionSnapshot, fallbackIndexes }) {
  const attended = Number(attendanceSnapshot?.attended_count || 0);
  const conducted = Number(attendanceSnapshot?.total_classes || 0);
  const avgAttendance = conducted > 0 ? attended / conducted : 0;
  const validMarks = (subjectSignals || [])
    .map((row) => (row?.marks_percentage === null || row?.marks_percentage === undefined ? null : Number(row.marks_percentage)))
    .filter((value) => value !== null);
  const avgMarks = validMarks.length ? validMarks.reduce((sum, value) => sum + Number(value), 0) / validMarks.length : null;
  const academicScoreIndex = avgMarks === null ? fallbackIndexes.academicScoreIndex : clamp((avgAttendance || 0) * (avgMarks / 100) * 100, 0, 100);

  const totalActions = Number(workoutSnapshot?.total_actions || 0);
  const skipped = Number(workoutSnapshot?.skipped_count || 0);
  const skipRate = totalActions > 0 ? skipped / totalActions : null;
  const fitnessDisciplineIndex = skipRate === null ? fallbackIndexes.fitnessDisciplineIndex : clamp((1 - skipRate) * 100, 0, 100);

  const daysLogged = Number(nutritionSnapshot?.days_logged || 0);
  const overLimitRatio = daysLogged > 0 ? Number(nutritionSnapshot?.over_limit_days || 0) / daysLogged : 0;
  const proteinDeficitRatio = Number(nutritionSnapshot?.protein_deficit_ratio || 0);
  const nutritionBalanceIndex = daysLogged === 0
    ? fallbackIndexes.nutritionBalanceIndex
    : clamp(100 - proteinDeficitRatio * 60 - overLimitRatio * 40, 0, 100);

  return {
    academicScoreIndex: Number(academicScoreIndex.toFixed(2)),
    fitnessDisciplineIndex: Number(fitnessDisciplineIndex.toFixed(2)),
    nutritionBalanceIndex: Number(nutritionBalanceIndex.toFixed(2))
  };
}

function toTopPercent(rank, totalUsers) {
  if (!rank || !totalUsers || totalUsers < 3) {
    return null;
  }
  return clamp(Math.round((Number(rank) / Number(totalUsers)) * 100), 1, 100);
}

function toBand(topPercent, totalUsers) {
  if (topPercent === null || !totalUsers || totalUsers < 3) {
    return "No cohort data yet";
  }
  if (topPercent <= 10) return "Top 10%";
  if (topPercent <= 20) return "Top 20%";
  if (topPercent <= 30) return "Top 30%";
  if (topPercent <= 50) return "Top 50%";
  return "Below Top 50%";
}

function buildScorecard(score, rank, totalUsers) {
  const normalizedScore = clamp(Number(score || 0), 0, 100);
  const topPercent = toTopPercent(rank, totalUsers);
  return {
    score: normalizedScore,
    rank: rank || null,
    totalUsers: totalUsers || null,
    topPercent,
    band: toBand(topPercent, totalUsers)
  };
}

function normalizeDateOnly(input) {
  const date = new Date(input);
  date.setHours(0, 0, 0, 0);
  return date;
}

function daysUntil(dateInput) {
  const due = normalizeDateOnly(dateInput);
  const today = normalizeDateOnly(new Date());
  return Math.round((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

function hourLabel(hourValue) {
  const hour = Number(hourValue);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
    return "7:00 PM";
  }
  const suffix = hour >= 12 ? "PM" : "AM";
  const normalized = hour % 12 === 0 ? 12 : hour % 12;
  return `${normalized}:00 ${suffix}`;
}

function findSubjectForDeadline(title, subjectSignals) {
  const normalizedTitle = String(title || "").toLowerCase();
  let best = null;

  for (const row of subjectSignals) {
    const subjectName = String(row.subject_name || "").trim();
    if (!subjectName) {
      continue;
    }
    const normalizedSubject = subjectName.toLowerCase();
    if (normalizedTitle.includes(normalizedSubject)) {
      if (!best || normalizedSubject.length > String(best.subject_name || "").length) {
        best = row;
      }
    }
  }

  return best;
}

function getClassLoadForDeadline(timetableLoadByDay, dueDate) {
  const due = new Date(dueDate);
  const day = due.getDay();
  if (day === 0 || day === 6) {
    return 0;
  }
  const dayOrder = day;
  return Number(timetableLoadByDay.get(dayOrder) || 0);
}

function buildDeadlineIntelligence({ deadlines, subjectSignals, timetableLoad, metrics }) {
  const timetableLoadByDay = new Map(timetableLoad.map((row) => [Number(row.day_order), Number(row.class_count || 0)]));
  const preferredStudyWindow = hourLabel(metrics.fitness?.best_time_slot);

  const items = deadlines.slice(0, 6).map((row) => {
    const daysLeftRaw = daysUntil(row.due_date);
    const daysLeft = Math.max(0, daysLeftRaw);
    const subject = findSubjectForDeadline(row.title, subjectSignals);
    const marksPct = subject?.marks_percentage === null || subject?.marks_percentage === undefined
      ? null
      : Number(subject.marks_percentage);
    const attendancePct = subject?.attendance_percentage === null || subject?.attendance_percentage === undefined
      ? null
      : Number(subject.attendance_percentage);
    const classLoad = getClassLoadForDeadline(timetableLoadByDay, row.due_date);

    const urgencyBase = daysLeft <= 1 ? 85 : daysLeft <= 3 ? 65 : daysLeft <= 7 ? 50 : 35;
    const marksPenalty = marksPct === null ? 10 : marksPct < 60 ? 35 : marksPct < 75 ? 20 : 0;
    const attendancePenalty = attendancePct === null ? 8 : attendancePct < 75 ? 25 : attendancePct < 85 ? 10 : 0;
    const loadPenalty = classLoad >= 6 ? 10 : classLoad >= 4 ? 5 : 0;
    const riskScore = clamp(urgencyBase + marksPenalty + attendancePenalty + loadPenalty, 0, 99);

    const status = riskScore >= 80 ? "at-risk" : riskScore >= 55 ? "needs-attention" : "safe";
    const baseTotalMinutes = riskScore >= 85 ? 420 : riskScore >= 70 ? 330 : riskScore >= 55 ? 270 : 180;
    const studyMinutesPerDay = clamp(Math.round(baseTotalMinutes / Math.max(1, daysLeft + 1)), 30, 180);

    const optimalStart = riskScore >= 85 ? "Now" : riskScore >= 70 ? "Today" : riskScore >= 55 ? "Within 24h" : "Within 48h";
    const microcopyParts = [
      daysLeft === 0 ? "Due today." : daysLeft === 1 ? "Due tomorrow." : `Due in ${daysLeft} days.`,
      marksPct !== null ? `Marks ${Math.round(marksPct)}%.` : "No marks trend yet.",
      attendancePct !== null ? `Attendance ${Math.round(attendancePct)}%.` : "No attendance trend yet."
    ];

    return {
      id: row.id,
      title: row.title,
      source: row.source,
      dueDateIso: String(row.due_date).slice(0, 10),
      daysLeft,
      status,
      optimalStart,
      studyMinutesPerDay,
      recommendedWindow: preferredStudyWindow,
      subjectName: subject?.subject_name || null,
      marksPercentage: marksPct,
      attendancePercentage: attendancePct,
      riskScore,
      microcopy: microcopyParts.join(" ")
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    items,
    noDataMessage: items.length === 0 ? "No upcoming academic deadlines yet. Add deadlines via calendar or Gmail parsing." : null
  };
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(Number(value))).map((value) => Number(value));
  if (valid.length === 0) {
    return null;
  }
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function buildBehaviorReasons({ metrics, workoutSnapshot, attendanceSnapshot, nutritionSnapshot, marksTrend, subjectSignals, deadlineIntelligence }) {
  const reasons = [];
  const gymSkipRate = Number(workoutSnapshot.total_actions || 0) > 0
    ? Number(workoutSnapshot.skipped_count || 0) / Number(workoutSnapshot.total_actions || 1)
    : Number(metrics.fitness?.skip_rate || 0);
  const classMissRate = Number(attendanceSnapshot.total_classes || 0) > 0
    ? Number(attendanceSnapshot.missed_count || 0) / Number(attendanceSnapshot.total_classes || 1)
    : 1 - Number(metrics.academic?.avg_attendance || 0);
  const avgMarksPct = average(subjectSignals.map((row) => row.marks_percentage));
  const proteinDeficitRatio = Number(
    nutritionSnapshot?.protein_deficit_ratio === null || nutritionSnapshot?.protein_deficit_ratio === undefined
      ? (metrics.nutrition?.protein_deficit_ratio || 0)
      : nutritionSnapshot.protein_deficit_ratio
  );
  const markDropRatio = Number(marksTrend.recent_ratio || 0) - Number(marksTrend.previous_ratio || 0);
  const urgentDeadlines = deadlineIntelligence.items.filter((item) => item.status === "at-risk").length;

  if (gymSkipRate >= 0.35 || Number(metrics.fitness?.skip_rate || 0) >= 0.35) {
    reasons.push({
      id: "reason-gym",
      domain: "fitness",
      severity: gymSkipRate >= 0.55 ? "high" : "medium",
      title: "Why gym sessions were missed",
      description:
        classMissRate >= 0.2 || proteinDeficitRatio >= 0.35
          ? "This might be because workout consistency dipped while class pressure and nutrition inconsistency were also present."
          : "This might be because your workout schedule became less stable in the recent routine window.",
      evidence: [
        `Recent workout skip rate was around ${Math.round(gymSkipRate * 100)}%.`,
        `Recent class miss rate was around ${Math.round(classMissRate * 100)}%.`,
        `Protein-deficit days ratio was around ${Math.round(proteinDeficitRatio * 100)}%.`
      ]
    });
  }

  if (classMissRate >= 0.2 || Number(metrics.academic?.avg_attendance || 0) < 0.75) {
    reasons.push({
      id: "reason-class",
      domain: "academic",
      severity: classMissRate >= 0.35 ? "high" : "medium",
      title: "Why classes were missed",
      description:
        gymSkipRate >= 0.35
          ? "This might be because class misses and gym misses rose together, which can indicate unstable routine blocks."
          : "This might be because attendance pressure increased during a lower-consistency academic period.",
      evidence: [
        `Recent class miss rate was around ${Math.round(classMissRate * 100)}%.`,
        `Workout skip rate was around ${Math.round(gymSkipRate * 100)}%.`,
        `Exam stress index was ${Number(metrics.academic?.exam_week_stress_index || 0).toFixed(2)}.`
      ]
    });
  }

  if ((avgMarksPct !== null && avgMarksPct < 70) || markDropRatio < -0.05) {
    reasons.push({
      id: "reason-marks",
      domain: "academic",
      severity: markDropRatio < -0.1 || (avgMarksPct !== null && avgMarksPct < 60) ? "high" : "medium",
      title: "Why marks are lower",
      description:
        classMissRate >= 0.2 || gymSkipRate >= 0.35 || proteinDeficitRatio >= 0.35
          ? "This might be because marks moved down while class misses, routine inconsistency, and nutrition gaps were also visible."
          : "This might be because preparation lead time before assessments was shorter than needed.",
      evidence: [
        avgMarksPct === null ? "Average marks: no data yet." : `Average marks were around ${Math.round(avgMarksPct)}%.`,
        marksTrend.previous_ratio === null ? "Recent vs previous marks: no baseline yet." : `Recent-vs-previous marks delta was ${Math.round(markDropRatio * 100)}%.`,
        `Urgent deadlines right now: ${urgentDeadlines}.`
      ]
    });
  }

  if (reasons.length === 0) {
    reasons.push({
      id: "reason-none",
      domain: "cross_domain",
      severity: "low",
      title: "Behavior analysis ready",
      description: "More history may be needed before causes can be inferred with confidence.",
      evidence: [
        `Workout logs: ${Number(workoutSnapshot.total_actions || 0)}`,
        `Attendance logs: ${Number(attendanceSnapshot.total_classes || 0)}`,
        `Marks components: ${Number(marksTrend.total_components || 0)}`
      ]
    });
  }

  return reasons.slice(0, 4);
}

function buildWarnings({ metrics, deadlineIntelligence, nutritionSnapshot }) {
  const warnings = [];

  if (Number(metrics.academic?.avg_attendance || 0) < 0.75) {
    warnings.push({
      id: "warn-attendance",
      domain: "academic",
      severity: "high",
      text: "Attendance is below 75%; this may increase short-term risk if class consistency does not improve."
    });
  }

  if (Number(metrics.fitness?.skip_rate || 0) > 0.45) {
    warnings.push({
      id: "warn-fitness",
      domain: "fitness",
      severity: "medium",
      text: "Workout skips are above 45%; this might improve by protecting one fixed gym slot."
    });
  }

  const proteinRatio = Number(
    nutritionSnapshot?.protein_deficit_ratio === null || nutritionSnapshot?.protein_deficit_ratio === undefined
      ? (metrics.nutrition?.protein_deficit_ratio || 0)
      : nutritionSnapshot.protein_deficit_ratio
  );
  if (proteinRatio > 0.4) {
    warnings.push({
      id: "warn-nutrition",
      domain: "nutrition",
      severity: "medium",
      text: "Protein deficit appears frequent; a protein-focused first meal might help consistency."
    });
  }

  const urgent = deadlineIntelligence.items.filter((item) => item.status === "at-risk");
  if (urgent.length > 0) {
    warnings.push({
      id: "warn-deadline",
      domain: "academic",
      severity: "high",
      text: `${urgent.length} academic deadline(s) look at risk; starting study blocks early may reduce pressure.`
    });
  }

  return warnings;
}

function buildInsights({ metrics, subjectSignals, deadlineIntelligence }) {
  const insights = [];
  const bestSubject = [...subjectSignals]
    .filter((row) => row.marks_percentage !== null && row.marks_percentage !== undefined)
    .sort((a, b) => Number(b.marks_percentage) - Number(a.marks_percentage))[0];

  if (bestSubject) {
    insights.push({
      id: "insight-best-subject",
      domain: "academic",
      text: `${bestSubject.subject_name} might currently be your strongest subject (${Math.round(Number(bestSubject.marks_percentage))}%).`
    });
  }

  if (metrics.fitness && Number.isFinite(Number(metrics.fitness.best_time_slot))) {
    insights.push({
      id: "insight-best-slot",
      domain: "fitness",
      text: `A potentially good workout completion window appears to be around ${hourLabel(metrics.fitness?.best_time_slot)}.`
    });
  }

  if (deadlineIntelligence.items.length > 0) {
    const soonest = deadlineIntelligence.items[0];
    insights.push({
      id: "insight-deadline",
      domain: "academic",
      text: `Nearest deadline appears to be ${soonest.title} (${soonest.daysLeft === 0 ? "today" : `${soonest.daysLeft} day(s) left`}).`
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: "insight-empty",
      domain: "cross_domain",
      text: "No strong trend is visible yet; continued daily logging may improve insight quality."
    });
  }

  return insights.slice(0, 4);
}

function buildRecommendations(metrics) {
  const recommendations = [];

  if (metrics.fitness && Number(metrics.fitness.skip_rate) > 0.6) {
    recommendations.push({
      id: randomUUID(),
      domain: "fitness",
      text: "Your skip rate is above 60%. Reschedule workouts to your best completion hour."
    });
  }

  if (metrics.fitness && Number(metrics.fitness.exam_week_drop_percentage) > 30) {
    recommendations.push({
      id: randomUUID(),
      domain: "fitness",
      text: "Exam weeks reduce workout consistency significantly. Switch to short maintenance sessions during exam weeks."
    });
  }

  if (metrics.academic && Number(metrics.academic.avg_attendance) < 0.75) {
    recommendations.push({
      id: randomUUID(),
      domain: "academic",
      text: "Attendance is below 75%. Prioritize attendance-critical classes this week."
    });
  }

  if (metrics.nutrition && Number(metrics.nutrition.protein_deficit_ratio) > 0.4) {
    recommendations.push({
      id: randomUUID(),
      domain: "nutrition",
      text: "Protein deficit is frequent. Add a high-protein meal in the first half of the day."
    });
  }

  if (
    metrics.academic &&
    metrics.fitness &&
    Number(metrics.academic.avg_attendance) < 0.75 &&
    Number(metrics.fitness.skip_rate) > 0.5
  ) {
    recommendations.push({
      id: randomUUID(),
      domain: "cross_domain",
      text: "Attendance pressure and workout skips are rising together. Use a lighter workout on heavy academic days."
    });
  }

  return recommendations;
}

async function enrichBehaviorSummary(userId, base, range = "all") {
  const rangeConfig = resolveRange(range);
  const windowDays = rangeConfig.days;
  const sinceDate = sinceDateIso(windowDays);
  const metrics = await behaviorModel.getMetricsForSummary(userId);
  const subjectSignals = await behaviorModel.listSubjectSignals(userId, sinceDate);
  const deadlines = await behaviorModel.listUpcomingAcademicDeadlines(userId, 6);
  const timetableLoad = await behaviorModel.getTimetableLoadByDay(userId);
  const workoutSnapshot = await behaviorModel.getRecentWorkoutSnapshot(userId, windowDays);
  const attendanceSnapshot = await behaviorModel.getRecentAttendanceSnapshot(userId, windowDays);
  const nutritionSnapshot = await behaviorModel.getNutritionSnapshot(userId, windowDays);
  const marksTrend = await behaviorModel.getRecentMarksTrend(userId, windowDays);
  const ranks = await behaviorModel.getCohortRanks(userId);

  const computedScores = computeScoreIndexes(metrics);
  const rangeScores = computeScoreIndexesFromRange({
    subjectSignals,
    attendanceSnapshot,
    workoutSnapshot,
    nutritionSnapshot,
    fallbackIndexes: computedScores
  });

  const baseSummary = base.summary || {
    academic_score_index: computedScores.academicScoreIndex,
    fitness_discipline_index: computedScores.fitnessDisciplineIndex,
    nutrition_balance_index: computedScores.nutritionBalanceIndex,
    overall_consistency_index: Number(
      ((computedScores.academicScoreIndex + computedScores.fitnessDisciplineIndex + computedScores.nutritionBalanceIndex) / 3).toFixed(2)
    )
  };

  const summary = rangeConfig.key === "all"
    ? baseSummary
    : {
        academic_score_index: rangeScores.academicScoreIndex,
        fitness_discipline_index: rangeScores.fitnessDisciplineIndex,
        nutrition_balance_index: rangeScores.nutritionBalanceIndex,
        overall_consistency_index: Number(
          ((rangeScores.academicScoreIndex + rangeScores.fitnessDisciplineIndex + rangeScores.nutritionBalanceIndex) / 3).toFixed(2)
        )
      };

  const deadlineIntelligence = buildDeadlineIntelligence({
    deadlines,
    subjectSignals,
    timetableLoad,
    metrics
  });

  const behaviorAnalysis = {
    generatedAt: new Date().toISOString(),
    reasons: buildBehaviorReasons({
      metrics,
      workoutSnapshot,
      attendanceSnapshot,
      nutritionSnapshot,
      marksTrend,
      subjectSignals,
      deadlineIntelligence
    }),
    warnings: buildWarnings({ metrics, deadlineIntelligence, nutritionSnapshot }),
    insights: buildInsights({ metrics, subjectSignals, deadlineIntelligence }),
    dataStatus: {
      hasAcademicData: subjectSignals.some((row) => row.attendance_percentage !== null || row.marks_percentage !== null),
      hasFitnessData: Number(workoutSnapshot.total_actions || 0) > 0 || !!metrics.fitness,
      hasNutritionData: Number(nutritionSnapshot?.days_logged || 0) > 0 || Number(metrics.nutrition?.logging_consistency || 0) > 0,
      hasDeadlineData: deadlineIntelligence.items.length > 0
    }
  };

  const totalUsers = Number(ranks?.total_users || 0) || null;
  const scorecards = {
    gyaan: buildScorecard(summary.academic_score_index, ranks?.academic_rank || null, totalUsers),
    karma: buildScorecard(summary.fitness_discipline_index, ranks?.fitness_rank || null, totalUsers),
    ahara: buildScorecard(summary.nutrition_balance_index, ranks?.nutrition_rank || null, totalUsers),
    overall: buildScorecard(summary.overall_consistency_index, ranks?.overall_rank || null, totalUsers)
  };

  return {
    range: rangeConfig.key,
    windowDays,
    summary,
    recommendations: base.recommendations || [],
    scorecards,
    behaviorAnalysis,
    deadlineIntelligence
  };
}

async function recomputeBehaviorSummary(userId) {
  const metrics = await behaviorModel.getMetricsForSummary(userId);
  const indexes = computeScoreIndexes(metrics);
  const academicScoreIndex = indexes.academicScoreIndex;
  const fitnessDisciplineIndex = indexes.fitnessDisciplineIndex;
  const nutritionBalanceIndex = indexes.nutritionBalanceIndex;

  const overallConsistencyIndex = Number(
    ((academicScoreIndex + fitnessDisciplineIndex + nutritionBalanceIndex) / 3).toFixed(2)
  );

  await behaviorModel.upsertBehaviorSummary({
    userId,
    academicScoreIndex,
    fitnessDisciplineIndex,
    nutritionBalanceIndex,
    overallConsistencyIndex
  });

  const recommendations = buildRecommendations(metrics);
  await behaviorModel.replaceRecommendations(userId, recommendations);

  const base = await behaviorModel.getBehaviorSummary(userId);
  return enrichBehaviorSummary(userId, base, "all");
}

async function getBehaviorSummary(userId, range = "all") {
  const rangeConfig = resolveRange(range);
  let base = await behaviorModel.getBehaviorSummary(userId);

  if (!base.summary && rangeConfig.key === "all") {
    const metrics = await behaviorModel.getMetricsForSummary(userId);
    if (metrics.academic || metrics.fitness || metrics.nutrition) {
      return recomputeBehaviorSummary(userId);
    }
  }

  base = base || { summary: null, recommendations: [] };
  return enrichBehaviorSummary(userId, base, rangeConfig.key);
}

async function recomputeAllBehaviorSummaries() {
  const users = await behaviorModel.listAllUsers();

  for (const user of users) {
    await recomputeBehaviorSummary(user.user_id);
  }

  return { usersProcessed: users.length };
}

module.exports = {
  recomputeBehaviorSummary,
  getBehaviorSummary,
  recomputeAllBehaviorSummaries
};
