const test = require("node:test");
const assert = require("node:assert/strict");

const recommendationService = require("../src/services/recommendation.service");

const {
  toSensitiveCopy,
  deriveCycleContext,
  deriveActivityContext,
  deriveMealTimingProfile,
  deriveSleepTimingProfile,
  chooseRecommendedStudyWindow,
  buildDeadlineIntelligence,
  deriveBayesianConsistency,
  deriveTimeSeriesPressure,
  deriveAttendanceRiskSignals,
  deriveDynamicObjectiveWeights,
  computePlanningCapacityMinutes,
  optimizeSessionsWithMIP,
  multiObjectivePriorityScore
} = recommendationService.__test;

test("deriveCycleContext detects active high-sensitivity menstrual phase", () => {
  const todayIso = "2026-03-02";
  const events = [
    { event_date: "2026-02-01", title: "Period start" },
    { event_date: "2026-03-01", title: "Period start" }
  ];
  const ctx = deriveCycleContext(events, todayIso);
  assert.equal(ctx.active, true);
  assert.equal(ctx.phase, "menstrual");
  assert.equal(ctx.sensitivity, "high");
  assert.equal(ctx.cycleDay, 2);
  assert.match(String(ctx.note || ""), /cycle-aware/i);
  assert.doesNotMatch(String(ctx.note || ""), /detected/i);
});

test("toSensitiveCopy keeps menstrual terms but softens wording", () => {
  const out = toSensitiveCopy("Cycle-sensitive period detected for the user.");
  assert.match(out, /cycle-aware/i);
  assert.match(out, /period/i);
  assert.doesNotMatch(out, /\buser\b/i);
  assert.doesNotMatch(out, /\bdetected\b/i);
});

test("deriveMealTimingProfile infers meal anchors from food image times", () => {
  const rows = [
    { uploaded_at: "2026-03-01T08:10:00" },
    { uploaded_at: "2026-03-02T08:40:00" },
    { uploaded_at: "2026-03-02T13:15:00" },
    { uploaded_at: "2026-03-03T13:45:00" }
  ];
  const profile = deriveMealTimingProfile(rows);
  assert.equal(profile.source, "food_logs");
  assert.ok(Number.isFinite(profile.anchors.breakfast));
  assert.ok(Number.isFinite(profile.anchors.lunch));
});

test("deriveActivityContext computes stress and trend from user activities", () => {
  const todayIso = "2026-03-02";
  const rows = [
    { event_date: "2026-02-27", event_type: "personal", title: "Family event" },
    { event_date: "2026-03-02", event_type: "travel", title: "Outstation travel all day" },
    { event_date: "2026-03-05", event_type: "meeting", title: "Project meeting" },
    { event_date: "2026-03-12", event_type: "work", title: "Internship shift" },
    { event_date: "2026-03-14", event_type: "work", title: "Office event full day" },
    { event_date: "2026-03-03", event_type: "academic", title: "Exam revision" }
  ];
  const ctx = deriveActivityContext(rows, todayIso);
  assert.ok(ctx.todayLoad > 1);
  assert.ok(ctx.activityStressIndex >= 0 && ctx.activityStressIndex <= 100);
  assert.ok(["rising", "stable", "easing"].includes(ctx.trend));
  assert.ok(Number.isFinite(ctx.focusCompressionFactor));
  assert.ok(ctx.topActivityTypes.length > 0);
});

test("deriveActivityContext tracks personal goal load from calendar titles", () => {
  const ctx = deriveActivityContext([
    { event_date: "2026-03-02", event_type: "personal", title: "Portfolio goal review" },
    { event_date: "2026-03-02", event_type: "personal", title: "Side project milestone" }
  ], "2026-03-02");
  assert.ok(Number(ctx.todayGoalLoad || 0) >= 2);
});

test("chooseRecommendedStudyWindow is cycle-aware under high sensitivity", () => {
  const window = chooseRecommendedStudyWindow({
    metrics: { fitness: { best_time_slot: 20 } },
    sleepProfile: deriveSleepTimingProfile([]),
    mealProfile: { anchors: {} },
    workoutContext: { blockedIntervals: [] },
    activityContext: { todayLoad: 0 },
    cycleContext: { active: true, sensitivity: "high" },
    daysLeft: 1,
    assessmentType: "Exam"
  });
  const m = String(window).match(/^(\d{2}):(\d{2})$/);
  assert.ok(m, "expected HH:MM window");
  const hh = Number(m[1]);
  assert.ok(hh >= 10 && hh <= 16, `expected daytime cycle-aware window, got ${window}`);
});

test("computePlanningCapacityMinutes shrinks with high activity stress", () => {
  const baseline = computePlanningCapacityMinutes({
    sleepProfile: { wakeMinutes: 420, bedtimeMinutes: 1410 },
    workoutContext: { blockedIntervals: [{ start: 1050, end: 1140 }] },
    cycleContext: { active: false },
    activityContext: { todayLoad: 0.5, next3DayLoad: 0.8, trend: "stable", activityStressIndex: 12 }
  });
  const stressed = computePlanningCapacityMinutes({
    sleepProfile: { wakeMinutes: 420, bedtimeMinutes: 1410 },
    workoutContext: { blockedIntervals: [{ start: 1050, end: 1140 }] },
    cycleContext: { active: false },
    activityContext: { todayLoad: 3.2, next3DayLoad: 3.6, trend: "rising", activityStressIndex: 82 }
  });
  assert.ok(stressed < baseline);
});

test("deriveBayesianConsistency updates posterior from adherence evidence", () => {
  const bayes = deriveBayesianConsistency({
    workoutSnapshot: { done_count: 22, skipped_count: 6 },
    attendanceSnapshot: { attended_count: 180, missed_count: 24 },
    metrics: { fitness: { consistency_score: 74 } }
  });
  assert.ok(bayes.posteriorSuccess > 0.65 && bayes.posteriorSuccess < 0.95);
  assert.ok(bayes.posteriorFailure > 0.05 && bayes.posteriorFailure < 0.35);
});

test("deriveAttendanceRiskSignals rises when classes are frequently missed", () => {
  const risk = deriveAttendanceRiskSignals({
    attendanceSnapshot: { attended_count: 18, missed_count: 14, total_classes: 32 },
    subjectSignals: [
      { attendance_percentage: 62 },
      { attendance_percentage: 70 },
      { attendance_percentage: 81 }
    ],
    metrics: { academic: { avg_attendance: 0.66 } }
  });
  assert.ok(risk.attendanceRiskIndex >= 50);
  assert.ok(risk.observedMissRate > 0.3);
  assert.ok(risk.lowAttendanceSubjects >= 2);
});

test("deriveTimeSeriesPressure captures rising near-term deadline load", () => {
  const deadlines = [
    { due_date: "2026-03-03", title: "Endsem Exam", assessmentType: "Exam" },
    { due_date: "2026-03-04", title: "PPT presentation", assessmentType: "Presentation" },
    { due_date: "2026-03-05", title: "Assignment 5", assessmentType: "Assignment" }
  ];
  const ts = deriveTimeSeriesPressure(deadlines);
  assert.ok(ts.pressureIndex > 0);
  assert.ok(Array.isArray(ts.series) && ts.series.length >= 10);
});

test("optimizeSessionsWithMIP respects minute budget while prioritizing utility", () => {
  const out = optimizeSessionsWithMIP([
    { id: "a", sessionMinutes: 45, maxSessions: 2, utilityPerSession: 85, mustStart: true },
    { id: "b", sessionMinutes: 35, maxSessions: 2, utilityPerSession: 50, mustStart: false },
    { id: "c", sessionMinutes: 30, maxSessions: 1, utilityPerSession: 45, mustStart: false }
  ], 90);
  const used = Number(out.usedMinutes || 0);
  assert.ok(used <= 90);
  assert.ok(Number(out.allocation.get("a") || 0) >= 1);
});

test("multiObjectivePriorityScore combines criteria into bounded score", () => {
  const score = multiObjectivePriorityScore({
    urgencyScore: 88,
    importanceScore: 72,
    difficultyScore: 64,
    conflictScore: 48,
    readinessPenalty: 32,
    cyclePenalty: 20
  });
  assert.ok(score >= 0 && score <= 100);
  assert.ok(score > 55);
});

test("deriveDynamicObjectiveWeights adapts conflict emphasis for busy users", () => {
  const lowStress = deriveDynamicObjectiveWeights({
    activityContext: { activityStressIndex: 10 },
    bayesian: { posteriorSuccess: 0.82 },
    cycleContext: { active: false }
  });
  const highStress = deriveDynamicObjectiveWeights({
    activityContext: { activityStressIndex: 86 },
    bayesian: { posteriorSuccess: 0.6 },
    cycleContext: { active: true, sensitivity: "high" }
  });
  const lowTotal = Object.values(lowStress).reduce((sum, value) => sum + value, 0);
  const highTotal = Object.values(highStress).reduce((sum, value) => sum + value, 0);
  assert.ok(Math.abs(lowTotal - 1) < 0.001);
  assert.ok(Math.abs(highTotal - 1) < 0.001);
  assert.ok(highStress.conflict > lowStress.conflict);
});

test("buildDeadlineIntelligence caps NPTEL assignment to one 30-minute block", () => {
  const todayIso = new Date().toISOString().slice(0, 10);
  const intelligence = buildDeadlineIntelligence({
    deadlines: [
      {
        id: "nptel-a1",
        title: "NPTEL Week 6 Assignment",
        due_date: todayIso,
        source: "gmail",
        provider: "nptel",
        assessmentType: "Assignment"
      }
    ],
    subjectSignals: [],
    timetableLoad: [],
    metrics: {},
    workoutContext: { blockedIntervals: [] },
    mealProfile: { anchors: {} },
    sleepProfile: { wakeMinutes: 7 * 60, bedtimeMinutes: 23 * 60 + 30, sleepDebtScore: 0 },
    activityContext: {
      loadByDate: new Map(),
      todayLoad: 0,
      next3DayLoad: 0,
      trend: "stable",
      activityStressIndex: 0,
      adaptiveSessionCap: 70
    },
    cycleContext: { active: false, sensitivity: "none" },
    workoutSnapshot: { done_count: 0, skipped_count: 0, total_actions: 0 },
    attendanceSnapshot: { attended_count: 0, missed_count: 0, total_classes: 0 },
    nutritionSnapshot: { days_logged: 0 }
  });

  assert.ok(Array.isArray(intelligence.items) && intelligence.items.length === 1);
  const item = intelligence.items[0];
  assert.equal(item.provider, "nptel");
  assert.ok(String(item.assessmentType || "").toLowerCase().includes("assignment"));
  assert.ok(Number(item.studyMinutesPerDay || 0) <= 30);
  assert.ok(Number(item.sessionCount || 0) <= 1);
  assert.ok(Number(item.sessionMinutes || 0) <= 30);
});
