const behaviorModel = require("../models/behavior.model");
const workoutPlanModel = require("../models/workout-plan.model");
const { createId } = require("../utils/id.util");

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

const DAILY_TUNING = {
  stepsTarget: Math.max(1000, envNumber("DAILY_SCORE_STEPS_TARGET", 7000)),
  caloriesTarget: Math.max(100, envNumber("DAILY_SCORE_CALORIES_TARGET", 450)),
  proteinTarget: Math.max(20, envNumber("DAILY_SCORE_PROTEIN_TARGET", 65)),
  calorieMin: Math.max(800, envNumber("DAILY_SCORE_CALORIE_MIN", 1700)),
  calorieMax: Math.max(1000, envNumber("DAILY_SCORE_CALORIE_MAX", 2600)),
  fitnessActionWeight: clamp(envNumber("DAILY_SCORE_FITNESS_ACTION_WEIGHT", 0.6), 0, 1),
  fitnessFitWeight: clamp(envNumber("DAILY_SCORE_FITNESS_FIT_WEIGHT", 0.4), 0, 1),
  overallAcademicWeight: clamp(envNumber("DAILY_SCORE_OVERALL_ACADEMIC_WEIGHT", 0.4), 0, 1),
  overallFitnessWeight: clamp(envNumber("DAILY_SCORE_OVERALL_FITNESS_WEIGHT", 0.35), 0, 1),
  overallNutritionWeight: clamp(envNumber("DAILY_SCORE_OVERALL_NUTRITION_WEIGHT", 0.25), 0, 1),
  academicAttendanceWeight: clamp(envNumber("DAILY_SCORE_ACADEMIC_ATTENDANCE_WEIGHT", 0.8), 0, 1),
  academicGoalWeight: clamp(envNumber("DAILY_SCORE_ACADEMIC_GOAL_WEIGHT", 0.2), 0, 1),
  trendDeltaThreshold: Math.max(0.1, envNumber("DAILY_SCORE_TREND_DELTA_THRESHOLD", 1.5)),
  defaultNeutral: clamp(envNumber("DAILY_SCORE_DEFAULT_NEUTRAL", 50), 0, 100)
};

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
  const raw = String(input || "").trim();
  const parts = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = parts
    ? new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
    : new Date(input);
  date.setHours(0, 0, 0, 0);
  return date;
}

function toIsoDateOnly(input) {
  const dt = new Date(input);
  if (!Number.isNaN(dt.getTime())) {
    return dt.toISOString().slice(0, 10);
  }
  return String(input || "").slice(0, 10);
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

function toSensitiveCopy(value, options = {}) {
  const source = String(value || "");
  if (!source.trim()) return source;

  let text = source
    .replace(/\buser's\b/gi, "your")
    .replace(/\busers\b/gi, "people")
    .replace(/\buser\b/gi, "you");

  const menstrualContext = options.menstrualContext === true
    || /\b(cycle|menstru|period|pms|ovulation)\b/i.test(text);
  if (menstrualContext) {
    text = text
      .replace(/\bcycle-sensitive\b/gi, "cycle-aware")
      .replace(/\bperiod detected\b/gi, "period noted")
      .replace(/\bdetected\b/gi, "noted")
      .replace(/\bfatigue windows\b/gi, "lower-energy windows")
      .replace(/\badded recovery buffers\b/gi, "extra recovery buffers");
  }

  return text.replace(/\s{2,}/g, " ").trim();
}

function findSubjectForDeadline(title, subjectSignals) {
  const normalizedTitle = String(title || "").toLowerCase();
  let best = null;

  for (const row of subjectSignals) {
    const subjectName = String(row.subject_name || "").trim();
    const subjectId = String(row.subject_id || "").trim();
    if (!subjectName) {
      continue;
    }
    const normalizedSubject = subjectName.toLowerCase();
    const normalizedSubjectId = subjectId.toLowerCase();
    const compactTitle = normalizedTitle.replace(/[^a-z0-9]/g, "");
    const compactSubjectId = normalizedSubjectId.replace(/[^a-z0-9]/g, "");
    const subjectCodeMatch = compactSubjectId.length >= 6 && compactTitle.includes(compactSubjectId);
    if (normalizedTitle.includes(normalizedSubject) || subjectCodeMatch) {
      if (!best || normalizedSubject.length > String(best.subject_name || "").length) {
        best = row;
      }
    }
  }

  return best;
}

function classifyDeadlineProvider(row) {
  const title = String(row?.title || "").toLowerCase();
  const source = String(row?.source || "").toLowerCase();
  const sender = String(row?.source_account_email || "").toLowerCase();

  if (
    title.includes("nptel")
    || title.includes("swayam")
    || /week\s*\d+/.test(title)
    || /content\s*&\s*assignment/.test(title)
    || sender.includes("nptel")
    || sender.includes("study.iitm")
  ) {
    return "nptel";
  }
  if (
    title.includes("classroom")
    || title.includes("google classroom")
    || title.includes("classwork")
    || title.includes("material posted")
    || title.includes("posted a new assignment")
    || sender.includes("classroom.google.com")
    || sender.includes("noreply@classroom")
    || sender.includes("no-reply@classroom")
    || source === "classroom"
  ) {
    return "classroom";
  }
  if (
    title.includes("ft-i")
    || title.includes("ft-ii")
    || title.includes("cie")
    || title.includes("cat")
    || title.includes("exam registration")
    || title.includes("internal")
    || sender.includes("srmist.edu.in")
    || source === "calendar"
  ) {
    return "college";
  }
  return "other";
}

function classifyAssessmentType(title) {
  const text = String(title || "").toLowerCase();
  if (/\bft[\s\-]*i\b|\bft[\s\-]*1\b|\bft1\b|first formative/i.test(text)) return "FT-1";
  if (/\bft[\s\-]*ii\b|\bft[\s\-]*2\b|\bft2\b|second formative/i.test(text)) return "FT-2";
  if (/\bpresentation\b|\bseminar\b|\bppt\b/i.test(text)) return "Presentation";
  if (/\bwritten\s*test\b|\bdescriptive\b|\bpen[\s\-]?paper\b/i.test(text)) return "Written Test";
  if (/\bonline\s*test\b|\bquiz\b|\bmcq\b|\bobjective\b/i.test(text)) return "Online Test";
  if (/\bpractical\b|\blab\b|\bviva\b/i.test(text)) return "Practical / Viva";
  if (/\bassignment\b|\bsubmission\b|\bdue\b|\bdeadline\b/i.test(text)) return "Assignment";
  if (/\bexam\s*registration\b|\bregistration\b/i.test(text)) return "Registration";
  if (/\bendsem\b|\bmidsem\b|\bexam\b/i.test(text)) return "Exam";
  return null;
}

function normalizeDeadlineTitle(title) {
  return String(title || "")
    .replace(/^study\s*:\s*/i, "")
    .replace(/^deadline\s*prep\s*:\s*/i, "")
    .replace(/^reminder\s*:\s*/i, "")
    .replace(/\bcontent\s*&\s*assignment\b/ig, "assignment")
    .replace(/\bis\s+live\s+now\b/ig, "")
    .replace(/\bis\s+now\s+live\b/ig, "")
    .replace(/\s*!+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalDeadlineKey(row, provider, assessmentType) {
  const normalizedTitle = normalizeDeadlineTitle(row?.title || "");
  const compact = normalizedTitle
    .toLowerCase()
    .replace(/\b(reminder|alert|notification|update|prep|study)\b/g, " ")
    .replace(/\b(last date|due date|is open now|open now|register now|registration open)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const signal = assessmentType ? assessmentType.toLowerCase() : "general";
  return `${provider}::${signal}::${compact}`;
}

function pickPreferredDeadline(existing, incoming) {
  const existingDays = Math.max(0, daysUntil(existing.due_date));
  const incomingDays = Math.max(0, daysUntil(incoming.due_date));
  if (incomingDays !== existingDays) {
    return incomingDays < existingDays ? incoming : existing;
  }

  const sourceRank = (row) => {
    const src = String(row?.source || "").toLowerCase();
    if (src === "gmail") return 2;
    if (src === "calendar") return 1;
    return 0;
  };
  const existingRank = sourceRank(existing);
  const incomingRank = sourceRank(incoming);
  if (incomingRank !== existingRank) {
    return incomingRank > existingRank ? incoming : existing;
  }

  return String(incoming.title || "").length > String(existing.title || "").length ? incoming : existing;
}

function dedupeDeadlineRows(deadlines) {
  const byKey = new Map();
  for (const row of deadlines || []) {
    const provider = classifyDeadlineProvider(row);
    const normalizedTitle = normalizeDeadlineTitle(row?.title || "");
    if (!normalizedTitle) {
      continue;
    }
    const assessmentType = classifyAssessmentType(normalizedTitle);
    const key = canonicalDeadlineKey(row, provider, assessmentType);
    if (!key) {
      continue;
    }
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        raw: { ...row, title: normalizedTitle || String(row?.title || "") },
        provider,
        assessmentType
      });
    } else {
      const chosen = pickPreferredDeadline(existing.raw, row);
      byKey.set(key, {
        raw: { ...chosen, title: normalizeDeadlineTitle(chosen?.title || "") || String(chosen?.title || "") },
        provider,
        assessmentType
      });
    }
  }

  return Array.from(byKey.values())
    .map((entry) => ({
      ...entry.raw,
      provider: entry.provider,
      assessmentType: entry.assessmentType
    }))
    .sort((a, b) => String(a.due_date || "").localeCompare(String(b.due_date || "")));
}

function providerSummaryLabel(provider) {
  if (provider === "nptel") return "NPTEL";
  if (provider === "classroom") return "Classroom";
  if (provider === "college") return "College";
  return "Academic";
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

function parseTimeToMinutes(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const hhmm = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (hhmm) {
    const hh = Number(hhmm[1]);
    const mm = Number(hhmm[2]);
    if (Number.isFinite(hh) && Number.isFinite(mm) && hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      return hh * 60 + mm;
    }
  }
  const ampm = text.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) {
    const hh = Number(ampm[1]) % 12;
    const mm = Number(ampm[2]);
    if (!Number.isFinite(mm) || mm < 0 || mm > 59) return null;
    const isPm = String(ampm[3]).toUpperCase() === "PM";
    return (hh + (isPm ? 12 : 0)) * 60 + mm;
  }
  return null;
}

function minutesToHHmm(value) {
  const normalized = ((Number(value) % 1440) + 1440) % 1440;
  const hh = String(Math.floor(normalized / 60)).padStart(2, "0");
  const mm = String(normalized % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function averageMinutes(values, pivot = 0) {
  const list = (values || [])
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v))
    .map((v) => (v < pivot ? v + 1440 : v));
  if (!list.length) return null;
  return Math.round(list.reduce((sum, v) => sum + v, 0) / list.length) % 1440;
}

function mergeIntervals(intervals) {
  const list = (intervals || [])
    .map((item) => ({ start: Number(item.start), end: Number(item.end) }))
    .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end))
    .map((item) => ({ start: Math.max(0, item.start), end: Math.min(1440, item.end) }))
    .filter((item) => item.end > item.start)
    .sort((a, b) => a.start - b.start);

  const out = [];
  for (const cur of list) {
    const last = out[out.length - 1];
    if (!last || cur.start > last.end) {
      out.push({ ...cur });
    } else {
      last.end = Math.max(last.end, cur.end);
    }
  }
  return out;
}

function assessmentRiskWeight(assessmentType) {
  const type = String(assessmentType || "").toLowerCase();
  if (!type) return 10;
  if (type.includes("exam")) return 24;
  if (type.includes("presentation")) return 20;
  if (type.includes("written")) return 18;
  if (type.includes("online")) return 16;
  if (type.includes("practical") || type.includes("viva")) return 17;
  if (type.includes("assignment")) return 14;
  if (type.includes("registration")) return 8;
  return 12;
}

function assessmentEffortMinutes(assessmentType) {
  const type = String(assessmentType || "").toLowerCase();
  if (!type) return 260;
  if (type.includes("exam")) return 640;
  if (type.includes("presentation")) return 420;
  if (type.includes("written")) return 480;
  if (type.includes("online")) return 360;
  if (type.includes("practical") || type.includes("viva")) return 380;
  if (type.includes("assignment")) return 300;
  if (type.includes("registration")) return 120;
  return 260;
}

function deriveMealTimingProfile(foodTimeRows) {
  const buckets = {
    breakfast: [],
    lunch: [],
    snack: [],
    dinner: []
  };
  for (const row of foodTimeRows || []) {
    const dt = new Date(row?.uploaded_at);
    if (Number.isNaN(dt.getTime())) continue;
    const minute = dt.getHours() * 60 + dt.getMinutes();
    const hour = dt.getHours();
    if (hour >= 5 && hour < 11) buckets.breakfast.push(minute);
    else if (hour >= 11 && hour < 16) buckets.lunch.push(minute);
    else if (hour >= 16 && hour < 19) buckets.snack.push(minute);
    else buckets.dinner.push(minute);
  }

  const anchors = {};
  for (const [key, values] of Object.entries(buckets)) {
    if (values.length < 2) continue;
    const avg = averageMinutes(values, key === "dinner" ? 4 * 60 : 0);
    if (avg !== null) {
      anchors[key] = avg;
    }
  }

  return {
    source: Object.keys(anchors).length > 0 ? "food_logs" : "default",
    anchors
  };
}

function deriveSleepTimingProfile(sleepSessions) {
  const starts = [];
  const ends = [];
  const durations = [];
  for (const row of sleepSessions || []) {
    const start = new Date(row?.start_time);
    const end = new Date(row?.end_time);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    const durationH = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    if (!Number.isFinite(durationH) || durationH < 2 || durationH > 14) continue;
    starts.push(start.getHours() * 60 + start.getMinutes());
    ends.push(end.getHours() * 60 + end.getMinutes());
    durations.push(durationH);
  }

  const bedtime = averageMinutes(starts, 16 * 60);
  const wakeTime = averageMinutes(ends, 3 * 60);
  const avgDuration = durations.length
    ? Number((durations.reduce((sum, v) => sum + v, 0) / durations.length).toFixed(2))
    : null;
  const sleepDebtScore = avgDuration === null
    ? 0
    : clamp(Math.round(Math.max(0, 7 - avgDuration) * 5), 0, 15);

  return {
    source: bedtime !== null && wakeTime !== null ? "sleep_logs" : "default",
    bedtimeMinutes: bedtime !== null ? bedtime : (23 * 60 + 30),
    wakeMinutes: wakeTime !== null ? wakeTime : (7 * 60),
    averageSleepHours: avgDuration,
    sleepDebtScore
  };
}

function isCycleSignalTitle(title) {
  const text = String(title || "").toLowerCase();
  return /\b(period|menstru|menstrual|pms|ovulation|cycle day)\b/.test(text);
}

function isCycleStartTitle(title) {
  const text = String(title || "").toLowerCase();
  return /\b(period start|start of period|cycle day 1|day 1|menstruation starts?)\b/.test(text);
}

function deriveCycleContext(calendarEvents, todayIso) {
  const today = normalizeDateOnly(todayIso);
  const cycleRows = (calendarEvents || [])
    .filter((row) => isCycleSignalTitle(row?.title))
    .map((row) => ({ dateIso: toIsoDateOnly(row?.event_date), title: String(row?.title || "") }))
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.dateIso))
    .sort((a, b) => a.dateIso.localeCompare(b.dateIso));

  if (!cycleRows.length) {
    return {
      active: false,
      source: null,
      phase: null,
      cycleDay: null,
      cycleLength: null,
      sensitivity: "none",
      note: null
    };
  }

  const startRows = cycleRows.filter((row) => isCycleStartTitle(row.title));
  const anchors = (startRows.length > 0 ? startRows : cycleRows).map((row) => row.dateIso);
  const intervals = [];
  for (let i = 1; i < anchors.length; i += 1) {
    const prev = normalizeDateOnly(anchors[i - 1]);
    const cur = normalizeDateOnly(anchors[i]);
    const diff = Math.round((cur.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000));
    if (diff >= 21 && diff <= 40) intervals.push(diff);
  }
  const cycleLength = intervals.length
    ? Math.round(intervals.reduce((sum, v) => sum + v, 0) / intervals.length)
    : 28;

  const pastAnchors = anchors.filter((iso) => normalizeDateOnly(iso).getTime() <= today.getTime());
  const lastStartIso = pastAnchors[pastAnchors.length - 1] || anchors[anchors.length - 1];
  const lastStart = normalizeDateOnly(lastStartIso);
  const cycleDay = Math.max(1, Math.round((today.getTime() - lastStart.getTime()) / (24 * 60 * 60 * 1000)) + 1);
  const dayInCycle = ((cycleDay - 1) % cycleLength) + 1;
  const ovulationStart = Math.max(10, Math.round(cycleLength * 0.46));
  const ovulationEnd = Math.min(cycleLength, ovulationStart + 2);
  const lateLutealStart = Math.max(ovulationEnd + 1, cycleLength - 5);

  let phase = "follicular";
  if (dayInCycle <= 5) phase = "menstrual";
  else if (dayInCycle >= ovulationStart && dayInCycle <= ovulationEnd) phase = "ovulation";
  else if (dayInCycle >= lateLutealStart) phase = "luteal";

  let sensitivity = "low";
  if ((phase === "menstrual" && dayInCycle <= 2) || (phase === "luteal" && dayInCycle >= cycleLength - 2)) {
    sensitivity = "high";
  } else if (phase === "menstrual" || (phase === "luteal" && dayInCycle >= cycleLength - 4)) {
    sensitivity = "medium";
  }

  const note = sensitivity === "high"
    ? toSensitiveCopy("Cycle-aware support suggests shorter focus blocks and extra recovery buffers.", { menstrualContext: true })
    : sensitivity === "medium"
      ? toSensitiveCopy("Cycle-aware pacing is active for moderate lower-energy windows.", { menstrualContext: true })
      : toSensitiveCopy("Cycle-aware mode is active.", { menstrualContext: true });

  return {
    active: true,
    source: "calendar_events",
    phase,
    cycleDay: dayInCycle,
    cycleLength,
    sensitivity,
    note
  };
}

function getActivityEventWeight(row) {
  const type = String(row?.event_type || "").toLowerCase();
  const title = String(row?.title || "").toLowerCase();
  let weight = 1;

  if (/(travel|trip|journey|flight|train|bus|outstation|airport)/.test(title) || type.includes("travel")) {
    weight += 1.2;
  } else if (
    /(meeting|interview|appointment|doctor|hospital|wedding|festival|competition|hackathon|event|shift|intern|office|work)/.test(title)
    || type.includes("work")
    || type.includes("meeting")
  ) {
    weight += 0.8;
  } else if (/(gym|workout|run|yoga|sport|practice|training)/.test(title) || type.includes("fitness")) {
    weight += 0.35;
  }

  if (/(all day|full day|overnight)/.test(title)) {
    weight += 0.5;
  }
  if (/\b(goal|milestone|target|habit|personal project|side project|portfolio|prep)\b/.test(title)) {
    weight += 0.35;
  }

  return clamp(Number(weight.toFixed(2)), 0.6, 3.4);
}

function deriveActivityContext(calendarEvents, todayIso) {
  const byDate = new Map();
  const goalByDate = new Map();
  const recentByDate = new Map();
  const typeCounts = new Map();
  const today = normalizeDateOnly(todayIso);
  const lookbackDate = new Date(today);
  lookbackDate.setDate(lookbackDate.getDate() - 14);
  const lastDate = new Date(today);
  lastDate.setDate(lastDate.getDate() + 30);

  for (const row of calendarEvents || []) {
    const dateIso = toIsoDateOnly(row?.event_date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) continue;
    const date = normalizeDateOnly(dateIso);
    if (date < lookbackDate || date > lastDate) continue;
    const type = String(row?.event_type || "").toLowerCase();
    const title = String(row?.title || "").toLowerCase();
    if (type === "academic" || /assignment|deadline|exam|quiz|submission|presentation|internal|ft-i|ft-ii/.test(title)) {
      continue;
    }
    const weight = getActivityEventWeight(row);
    const isGoalLike = /\b(goal|milestone|target|habit|personal project|side project|portfolio|interview prep|practice)\b/.test(title);
    if (date >= today) {
      byDate.set(dateIso, Number(byDate.get(dateIso) || 0) + weight);
      if (isGoalLike) goalByDate.set(dateIso, Number(goalByDate.get(dateIso) || 0) + 1);
    } else {
      recentByDate.set(dateIso, Number(recentByDate.get(dateIso) || 0) + weight);
    }
    const bucket = type || "general";
    typeCounts.set(bucket, Number(typeCounts.get(bucket) || 0) + 1);
  }

  const recentDates = listIsoDatesInclusive(shiftIsoDate(todayIso, -14), shiftIsoDate(todayIso, -1));
  const upcoming14Dates = listIsoDatesInclusive(todayIso, shiftIsoDate(todayIso, 13));
  const next3Dates = listIsoDatesInclusive(todayIso, shiftIsoDate(todayIso, 2));
  const next7Dates = listIsoDatesInclusive(todayIso, shiftIsoDate(todayIso, 6));

  const recentSeries = recentDates.map((iso) => Number(recentByDate.get(iso) || 0));
  const upcoming14Series = upcoming14Dates.map((iso) => Number(byDate.get(iso) || 0));
  const next3Series = next3Dates.map((iso) => Number(byDate.get(iso) || 0));
  const next7Series = next7Dates.map((iso) => Number(byDate.get(iso) || 0));
  const next7GoalLoad = next7Dates.reduce((sum, iso) => sum + Number(goalByDate.get(iso) || 0), 0);

  const recentAvgLoad = Number((average(recentSeries) || 0).toFixed(3));
  const upcomingAvgLoad = Number((average(upcoming14Series) || 0).toFixed(3));
  const next3DayLoad = Number((average(next3Series) || 0).toFixed(3));
  const next7DayLoad = Number((average(next7Series) || 0).toFixed(3));
  const peakUpcomingLoad = Number(Math.max(0, ...(upcoming14Series || [0])).toFixed(3));
  const firstHalf = average(upcoming14Series.slice(0, 7)) || 0;
  const secondHalf = average(upcoming14Series.slice(7, 14)) || 0;
  const momentum = Number((secondHalf - firstHalf).toFixed(3));
  const trend = momentum > 0.22 ? "rising" : momentum < -0.22 ? "easing" : "stable";

  const activityStressIndex = clamp(
    Math.round(
      (Number(byDate.get(todayIso) || 0) * 16)
      + (next3DayLoad * 18)
      + (next7DayLoad * 10)
      + (peakUpcomingLoad * 11)
      + (Math.max(0, momentum) * 45)
      + (Math.max(0, upcomingAvgLoad - recentAvgLoad) * 16)
      + (next7GoalLoad * 3)
    ),
    0,
    100
  );

  const adaptiveSessionCap = activityStressIndex >= 75
    ? 40
    : activityStressIndex >= 58
      ? 50
      : activityStressIndex >= 40
        ? 60
        : 70;

  const focusCompressionFactor = clamp(Number((1 - (activityStressIndex / 185)).toFixed(3)), 0.45, 1);

  return {
    loadByDate: byDate,
    goalLoadByDate: goalByDate,
    todayLoad: Number(byDate.get(todayIso) || 0),
    todayGoalLoad: Number(goalByDate.get(todayIso) || 0),
    next3DayLoad,
    next7DayLoad,
    recentAvgLoad,
    upcomingAvgLoad,
    peakUpcomingLoad,
    momentum,
    trend,
    activityStressIndex,
    adaptiveSessionCap,
    focusCompressionFactor,
    topActivityTypes: [...typeCounts.entries()]
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 3)
      .map(([type, count]) => ({ type, count: Number(count) }))
  };
}

function deriveWorkoutContext(workoutPlan) {
  if (!workoutPlan) {
    return { blockedIntervals: [] };
  }
  const blocked = [];
  const workoutStart = parseTimeToMinutes(workoutPlan.schedule_start_time || workoutPlan.startTime || null);
  const workoutEnd = parseTimeToMinutes(workoutPlan.schedule_end_time || workoutPlan.endTime || null);
  if (workoutStart !== null && workoutEnd !== null && workoutEnd > workoutStart) {
    blocked.push({ start: workoutStart - 45, end: workoutEnd + 45 });
  }

  const preMeal = parseTimeToMinutes(workoutPlan.pre_workout_meal_time || workoutPlan.preWorkoutMealTime || null);
  const postMeal = parseTimeToMinutes(workoutPlan.post_workout_meal_time || workoutPlan.postWorkoutMealTime || null);
  if (preMeal !== null) blocked.push({ start: preMeal - 40, end: preMeal + 50 });
  if (postMeal !== null) blocked.push({ start: postMeal - 40, end: postMeal + 50 });

  return { blockedIntervals: mergeIntervals(blocked) };
}

function buildDeadlineDensity(deadlines) {
  const byDate = new Map();
  let near3 = 0;
  let near7 = 0;
  for (const row of deadlines || []) {
    const dateIso = toIsoDateOnly(row?.due_date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) continue;
    const assessment = row?.assessmentType || classifyAssessmentType(row?.title || "");
    const weight = 1 + (assessmentRiskWeight(assessment) / 20);
    byDate.set(dateIso, Number(byDate.get(dateIso) || 0) + weight);
    const days = Math.max(0, daysUntil(dateIso));
    if (days <= 3) near3 += weight;
    if (days <= 7) near7 += weight;
  }
  return { byDate, near3, near7 };
}

function betaPosteriorMean({ success, failure, alpha = 2, beta = 2 }) {
  const s = Math.max(0, Number(success || 0));
  const f = Math.max(0, Number(failure || 0));
  return (alpha + s) / (alpha + beta + s + f);
}

function deriveBayesianConsistency({ workoutSnapshot, attendanceSnapshot, metrics }) {
  const done = Number(workoutSnapshot?.done_count || 0);
  const skipped = Number(workoutSnapshot?.skipped_count || 0);
  const attended = Number(attendanceSnapshot?.attended_count || 0);
  const missed = Number(attendanceSnapshot?.missed_count || 0);
  const workoutPosterior = betaPosteriorMean({ success: done, failure: skipped, alpha: 1.8, beta: 1.8 });
  // Scale attendance counts so a large timetable history does not fully dominate.
  const attendancePosterior = betaPosteriorMean({
    success: attended / 5,
    failure: missed / 5,
    alpha: 2.2,
    beta: 1.6
  });
  const historicalConsistency = Number(metrics?.fitness?.consistency_score || 0) > 0
    ? clamp(Number(metrics.fitness.consistency_score) / 100, 0.05, 0.99)
    : null;
  const posteriorSuccess = clamp(
    average([
      workoutPosterior,
      attendancePosterior,
      historicalConsistency
    ]) || 0.58,
    0.05,
    0.99
  );
  return {
    posteriorSuccess,
    posteriorFailure: Number((1 - posteriorSuccess).toFixed(4)),
    workoutPosterior: Number(workoutPosterior.toFixed(4)),
    attendancePosterior: Number(attendancePosterior.toFixed(4))
  };
}

function buildWeightedDueSeries(deadlines, horizonDays = 14) {
  const safeHorizon = Math.max(3, Math.min(30, Number(horizonDays || 14)));
  const out = Array.from({ length: safeHorizon }, () => 0);
  for (const row of deadlines || []) {
    const days = Math.max(0, daysUntil(row?.due_date));
    if (!Number.isFinite(days) || days >= safeHorizon) continue;
    const assessment = row?.assessmentType || classifyAssessmentType(row?.title || "");
    const weight = 1 + (assessmentRiskWeight(assessment) / 24);
    out[days] += weight;
  }
  return out;
}

function holtLinearForecast(series, alpha = 0.55, beta = 0.25, steps = 3) {
  const values = (series || []).map((v) => Math.max(0, Number(v || 0)));
  if (!values.length) return { forecast: [], level: 0, trend: 0 };
  let level = values[0];
  let trend = values.length >= 2 ? (values[1] - values[0]) : 0;
  for (let i = 1; i < values.length; i += 1) {
    const value = values[i];
    const prevLevel = level;
    level = alpha * value + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }
  const forecast = [];
  const horizon = Math.max(1, Math.min(10, Number(steps || 3)));
  for (let m = 1; m <= horizon; m += 1) {
    forecast.push(Math.max(0, level + (m * trend)));
  }
  return { forecast, level, trend };
}

function deriveTimeSeriesPressure(deadlines) {
  const series = buildWeightedDueSeries(deadlines, 14);
  const model = holtLinearForecast(series, 0.58, 0.22, 4);
  const forecastMean = average(model.forecast) || 0;
  const slope = Number(model.trend || 0);
  const recent = average(series.slice(0, 4)) || 0;
  const pressureIndex = clamp(Math.round((forecastMean * 7) + (Math.max(0, slope) * 10) + (recent * 4)), 0, 35);
  return {
    pressureIndex,
    forecastMean: Number(forecastMean.toFixed(3)),
    slope: Number(slope.toFixed(3)),
    series
  };
}

function deriveAttendanceRiskSignals({ attendanceSnapshot, subjectSignals, metrics }) {
  const attended = Number(attendanceSnapshot?.attended_count || 0);
  const missed = Number(attendanceSnapshot?.missed_count || 0);
  const total = Math.max(0, Number(attendanceSnapshot?.total_classes || 0));
  const avgAttendance = clamp(Number(metrics?.academic?.avg_attendance || 0), 0, 1);
  const observedMissRate = total > 0
    ? clamp(missed / Math.max(1, total), 0, 1)
    : clamp(1 - avgAttendance, 0, 1);

  const lowAttendanceSubjects = (subjectSignals || [])
    .filter((row) => Number.isFinite(Number(row?.attendance_percentage)))
    .filter((row) => Number(row.attendance_percentage) < 75).length;
  const severeAttendanceSubjects = (subjectSignals || [])
    .filter((row) => Number.isFinite(Number(row?.attendance_percentage)))
    .filter((row) => Number(row.attendance_percentage) < 65).length;

  const attendanceRiskIndex = clamp(
    Math.round(
      (observedMissRate * 72)
      + (lowAttendanceSubjects * 8)
      + (severeAttendanceSubjects * 6)
      + (Math.max(0, (0.75 - avgAttendance) * 100) * 0.35)
    ),
    0,
    100
  );

  return {
    observedMissRate: Number(observedMissRate.toFixed(4)),
    lowAttendanceSubjects,
    severeAttendanceSubjects,
    attendanceRiskIndex
  };
}

function deriveDynamicObjectiveWeights({ activityContext, bayesian, cycleContext }) {
  const stress = clamp(Number(activityContext?.activityStressIndex || 0), 0, 100) / 100;
  const adherenceGap = 1 - clamp(Number(bayesian?.posteriorSuccess || 0.58), 0.05, 0.99);
  const cycleWeightBoost = cycleContext?.active
    ? (cycleContext.sensitivity === "high" ? 0.04 : cycleContext.sensitivity === "medium" ? 0.02 : 0.008)
    : 0;

  const raw = {
    urgency: 0.34 + (stress * 0.07),
    importance: 0.24 + (adherenceGap * 0.05),
    difficulty: 0.18 + (adherenceGap * 0.04),
    conflict: 0.12 + (stress * 0.08),
    readiness: 0.08 + (adherenceGap * 0.07),
    cycle: 0.04 + cycleWeightBoost
  };
  const total = Object.values(raw).reduce((sum, value) => sum + Number(value), 0) || 1;
  return {
    urgency: Number((raw.urgency / total).toFixed(4)),
    importance: Number((raw.importance / total).toFixed(4)),
    difficulty: Number((raw.difficulty / total).toFixed(4)),
    conflict: Number((raw.conflict / total).toFixed(4)),
    readiness: Number((raw.readiness / total).toFixed(4)),
    cycle: Number((raw.cycle / total).toFixed(4))
  };
}

function multiObjectivePriorityScore({
  urgencyScore,
  importanceScore,
  difficultyScore,
  conflictScore,
  readinessPenalty,
  cyclePenalty,
  objectiveWeights
}) {
  const u = clamp(Number(urgencyScore || 0), 0, 100) / 100;
  const i = clamp(Number(importanceScore || 0), 0, 100) / 100;
  const d = clamp(Number(difficultyScore || 0), 0, 100) / 100;
  const c = clamp(Number(conflictScore || 0), 0, 100) / 100;
  const r = clamp(Number(readinessPenalty || 0), 0, 100) / 100;
  const p = clamp(Number(cyclePenalty || 0), 0, 100) / 100;
  const defaults = {
    urgency: 0.34,
    importance: 0.24,
    difficulty: 0.18,
    conflict: 0.12,
    readiness: 0.08,
    cycle: 0.04
  };
  const merged = {
    urgency: Number(objectiveWeights?.urgency ?? defaults.urgency),
    importance: Number(objectiveWeights?.importance ?? defaults.importance),
    difficulty: Number(objectiveWeights?.difficulty ?? defaults.difficulty),
    conflict: Number(objectiveWeights?.conflict ?? defaults.conflict),
    readiness: Number(objectiveWeights?.readiness ?? defaults.readiness),
    cycle: Number(objectiveWeights?.cycle ?? defaults.cycle)
  };
  const total = Object.values(merged).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0) || 1;
  const normalized = {
    urgency: merged.urgency / total,
    importance: merged.importance / total,
    difficulty: merged.difficulty / total,
    conflict: merged.conflict / total,
    readiness: merged.readiness / total,
    cycle: merged.cycle / total
  };
  // Weighted multi-objective blend, with optional personalized weights from activity context.
  const score = (normalized.urgency * u)
    + (normalized.importance * i)
    + (normalized.difficulty * d)
    + (normalized.conflict * c)
    + (normalized.readiness * r)
    + (normalized.cycle * p);
  return clamp(Math.round(score * 100), 0, 100);
}

function computePlanningCapacityMinutes({ sleepProfile, workoutContext, cycleContext, activityContext }) {
  const wake = Number(sleepProfile?.wakeMinutes || (7 * 60));
  const bed = Number(sleepProfile?.bedtimeMinutes || (23 * 60 + 30));
  const dayWindow = Math.max(240, (bed - wake) - 240); // exclude base life time for commute/meals
  const blockedWorkout = (workoutContext?.blockedIntervals || [])
    .reduce((sum, interval) => sum + Math.max(0, Number(interval.end) - Number(interval.start)), 0);
  const cycleFactor = cycleContext?.active
    ? (cycleContext.sensitivity === "high" ? 0.76 : cycleContext.sensitivity === "medium" ? 0.88 : 0.95)
    : 1;
  const activityStress = Number(activityContext?.activityStressIndex || 0);
  const todayLoad = Number(activityContext?.todayLoad || 0);
  const next3Load = Number(activityContext?.next3DayLoad || todayLoad);
  const trend = String(activityContext?.trend || "stable");
  const trendAdjustment = trend === "rising" ? -24 : trend === "easing" ? 12 : 0;
  const activityPenalty = (todayLoad * 22) + (next3Load * 12) + (activityStress * 1.15);
  const baselineBoost = activityStress <= 20 && trend !== "rising" ? 16 : 0;
  const raw = ((dayWindow - (blockedWorkout * 0.3) - activityPenalty + trendAdjustment + baselineBoost) * cycleFactor);
  const dynamicUpperBound = clamp(Math.round(430 - (activityStress * 1.5)), 260, 430);
  return clamp(Math.round(raw / 5) * 5, 60, dynamicUpperBound);
}

function optimizeSessionsWithMIP(items, budgetMinutes) {
  const candidates = (items || []).map((item) => ({
    id: String(item.id || ""),
    sessionMinutes: Math.max(20, Number(item.sessionMinutes || 30)),
    maxSessions: Math.max(1, Math.min(6, Number(item.maxSessions || item.sessionCount || 1))),
    utilityPerSession: Math.max(1, Number(item.utilityPerSession || 1)),
    mustStart: Boolean(item.mustStart)
  })).filter((item) => item.id);
  if (!candidates.length) return { allocation: new Map(), budgetMinutes: Number(budgetMinutes || 0), usedMinutes: 0 };

  const vars = [];
  for (const item of candidates) {
    for (let s = 0; s < item.maxSessions; s += 1) {
      vars.push({
        id: item.id,
        minutes: item.sessionMinutes,
        // Mandatory first session gets a bonus so optimizer strongly prefers it.
        utility: item.utilityPerSession + (item.mustStart && s === 0 ? 45 : 0)
      });
    }
  }

  const unit = 5;
  const cap = Math.max(0, Math.floor(Number(budgetMinutes || 0) / unit));
  const weights = vars.map((v) => Math.max(1, Math.floor(v.minutes / unit)));
  const values = vars.map((v) => Number(v.utility));
  const n = vars.length;

  const dp = Array.from({ length: n + 1 }, () => Array(cap + 1).fill(0));
  const take = Array.from({ length: n + 1 }, () => Array(cap + 1).fill(false));

  for (let i = 1; i <= n; i += 1) {
    const w = weights[i - 1];
    const val = values[i - 1];
    for (let c = 0; c <= cap; c += 1) {
      let best = dp[i - 1][c];
      let choose = false;
      if (w <= c) {
        const candidate = dp[i - 1][c - w] + val;
        if (candidate > best) {
          best = candidate;
          choose = true;
        }
      }
      dp[i][c] = best;
      take[i][c] = choose;
    }
  }

  const allocation = new Map();
  let c = cap;
  for (let i = n; i >= 1; i -= 1) {
    if (!take[i][c]) continue;
    const variable = vars[i - 1];
    allocation.set(variable.id, Number(allocation.get(variable.id) || 0) + 1);
    c -= weights[i - 1];
    if (c <= 0) break;
  }

  let usedMinutes = 0;
  for (const item of candidates) {
    const sessions = Number(allocation.get(item.id) || 0);
    usedMinutes += sessions * item.sessionMinutes;
  }

  return {
    allocation,
    budgetMinutes: cap * unit,
    usedMinutes
  };
}

function chooseRecommendedStudyWindow({
  metrics,
  sleepProfile,
  mealProfile,
  workoutContext,
  activityContext,
  cycleContext,
  daysLeft,
  assessmentType
}) {
  const baseHour = Number(metrics?.fitness?.best_time_slot);
  let candidate = Number.isFinite(baseHour) ? clamp(baseHour, 6, 22) * 60 : (19 * 60);
  const type = String(assessmentType || "").toLowerCase();
  if (type.includes("exam")) candidate = Math.min(candidate, 10 * 60);
  if (daysLeft <= 1) candidate = Math.min(candidate, 11 * 60);
  if (cycleContext?.active && cycleContext.sensitivity === "high") candidate = 11 * 60;
  if (cycleContext?.active && cycleContext.sensitivity === "medium") candidate = Math.min(candidate, 16 * 60);
  const activityStress = Number(activityContext?.activityStressIndex || 0);
  const activityTrend = String(activityContext?.trend || "stable");
  if (Number(activityContext?.todayLoad || 0) >= 3 || activityStress >= 72) candidate = Math.max(8 * 60, candidate - 90);
  else if (activityStress >= 48) candidate = Math.max(8 * 60, candidate - 45);
  if (activityTrend === "rising") candidate = Math.max(8 * 60, candidate - 30);
  if (activityTrend === "easing" && daysLeft > 2) candidate = Math.min(candidate + 15, 20 * 60);

  const earliest = clamp(Number(sleepProfile?.wakeMinutes || 7 * 60) + 75, 6 * 60, 20 * 60);
  const latest = clamp(Number(sleepProfile?.bedtimeMinutes || (23 * 60 + 30)) - 90, earliest + 30, 22 * 60 + 30);

  const blocked = [...(workoutContext?.blockedIntervals || [])];
  for (const minute of Object.values(mealProfile?.anchors || {})) {
    blocked.push({ start: Number(minute) - 45, end: Number(minute) + 50 });
  }
  const mergedBlocked = mergeIntervals(blocked);
  const isBlocked = (minute) => mergedBlocked.some((item) => minute >= item.start && minute < item.end);

  const normalizedCandidate = clamp(candidate, earliest, latest);
  if (!isBlocked(normalizedCandidate)) {
    return minutesToHHmm(normalizedCandidate);
  }

  for (let delta = 30; delta <= 360; delta += 30) {
    const left = normalizedCandidate - delta;
    const right = normalizedCandidate + delta;
    if (left >= earliest && !isBlocked(left)) return minutesToHHmm(left);
    if (right <= latest && !isBlocked(right)) return minutesToHHmm(right);
  }

  return minutesToHHmm(earliest);
}

function buildDeadlineIntelligence({
  deadlines,
  subjectSignals,
  timetableLoad,
  metrics,
  workoutContext,
  mealProfile,
  sleepProfile,
  activityContext,
  cycleContext,
  workoutSnapshot,
  attendanceSnapshot,
  nutritionSnapshot
}) {
  const timetableLoadByDay = new Map(timetableLoad.map((row) => [Number(row.day_order), Number(row.class_count || 0)]));
  const normalizedDeadlines = dedupeDeadlineRows(deadlines);
  const density = buildDeadlineDensity(normalizedDeadlines);
  const bayesian = deriveBayesianConsistency({ workoutSnapshot, attendanceSnapshot, metrics });
  const tsPressure = deriveTimeSeriesPressure(normalizedDeadlines);
  const attendanceRisk = deriveAttendanceRiskSignals({ attendanceSnapshot, subjectSignals, metrics });
  const rlDataPoints = Number(workoutSnapshot?.total_actions || 0)
    + Number(attendanceSnapshot?.total_classes || 0)
    + Number(nutritionSnapshot?.days_logged || 0);
  const adaptivePolicy = rlDataPoints >= 420 ? "contextual-bandit-ready" : "rule-based";
  const objectiveWeights = deriveDynamicObjectiveWeights({ activityContext, bayesian, cycleContext });
  const activityStressIndex = Number(activityContext?.activityStressIndex || 0);

  const preItems = normalizedDeadlines.slice(0, 8).map((row) => {
    const daysLeftRaw = daysUntil(row.due_date);
    const daysLeft = Math.max(0, daysLeftRaw);
    const provider = row.provider || classifyDeadlineProvider(row);
    const assessmentType = row.assessmentType || classifyAssessmentType(row.title);
    const isNptelAssignment = provider === "nptel" && String(assessmentType || "").toLowerCase().includes("assignment");
    const useCollegeSignals = provider === "college";
    const subject = useCollegeSignals ? findSubjectForDeadline(row.title, subjectSignals) : null;
    const marksPct = subject?.marks_percentage === null || subject?.marks_percentage === undefined
      ? null
      : Number(subject.marks_percentage);
    const attendancePct = subject?.attendance_percentage === null || subject?.attendance_percentage === undefined
      ? null
      : Number(subject.attendance_percentage);
    const classLoad = getClassLoadForDeadline(timetableLoadByDay, row.due_date);
    const dueDateIso = toIsoDateOnly(row.due_date);

    const urgencyBase = daysLeft <= 1 ? 90 : daysLeft <= 3 ? 72 : daysLeft <= 7 ? 56 : 38;
    const typeRisk = assessmentRiskWeight(assessmentType);
    const marksPenalty = !useCollegeSignals ? 0 : (marksPct === null ? 8 : marksPct < 60 ? 28 : marksPct < 75 ? 16 : 0);
    const attendancePenalty = !useCollegeSignals ? 0 : (attendancePct === null ? 7 : attendancePct < 75 ? 22 : attendancePct < 85 ? 10 : 0);
    const loadPenalty = classLoad >= 6 ? 12 : classLoad >= 4 ? 7 : classLoad >= 2 ? 3 : 0;
    const sameDayDensity = Number(density.byDate.get(dueDateIso) || 0);
    const clusterPenalty = density.near3 >= 8 ? 12 : density.near3 >= 5 ? 8 : density.near7 >= 10 ? 5 : 0;
    const sameDayPenalty = sameDayDensity >= 4 ? 12 : sameDayDensity >= 2.5 ? 7 : sameDayDensity >= 1.5 ? 3 : 0;
    const personalLoad = Number(activityContext?.loadByDate?.get(dueDateIso) || 0);
    const personalGoalLoad = Number(activityContext?.goalLoadByDate?.get(dueDateIso) || 0);
    const personalPenalty = personalLoad >= 3 ? 10 : personalLoad >= 2 ? 6 : personalLoad >= 1 ? 2 : 0;
    const personalGoalPenalty = personalGoalLoad >= 2 ? 8 : personalGoalLoad === 1 ? 3 : 0;
    const activityStressPenalty = Math.round(activityStressIndex * (daysLeft <= 3 ? 0.08 : 0.05));
    const attendanceMissPenalty = Math.round(attendanceRisk.attendanceRiskIndex * (daysLeft <= 3 ? 0.11 : 0.07));
    const sleepPenalty = Number(sleepProfile?.sleepDebtScore || 0);
    const cyclePenalty = cycleContext?.active && daysLeft <= 5
      ? (cycleContext.sensitivity === "high" ? 10 : cycleContext.sensitivity === "medium" ? 5 : 0)
      : 0;

    const objectivePriority = multiObjectivePriorityScore({
      urgencyScore: urgencyBase,
      importanceScore: typeRisk + marksPenalty + attendancePenalty + Math.round(attendanceRisk.attendanceRiskIndex * 0.25),
      difficultyScore: clamp((assessmentEffortMinutes(assessmentType) / 7), 0, 100),
      conflictScore: Math.round((classLoad * 7) + (sameDayDensity * 8) + (personalLoad * 8) + (personalGoalLoad * 9)),
      readinessPenalty: Math.round((bayesian.posteriorFailure * 100) + sleepPenalty + (activityStressIndex * 0.35) + (attendanceRisk.attendanceRiskIndex * 0.25)),
      cyclePenalty: cyclePenalty * 5,
      objectiveWeights
    });

    const baseRisk = clamp(
      urgencyBase
      + typeRisk
      + marksPenalty
      + attendancePenalty
      + loadPenalty
      + clusterPenalty
      + sameDayPenalty
      + personalPenalty
      + personalGoalPenalty
      + cyclePenalty
      + activityStressPenalty
      + attendanceMissPenalty,
      0,
      99
    );
    const bayesianRiskAdjustment = Math.round(bayesian.posteriorFailure * 14);
    const tsPenalty = clamp(Math.round(tsPressure.pressureIndex * 0.28), 0, 10);
    const riskScore = clamp(
      Math.round((baseRisk * 0.58) + (objectivePriority * 0.42) + bayesianRiskAdjustment + tsPenalty + (sleepPenalty * 0.35)),
      0,
      99
    );

    const status = riskScore >= 82 ? "at-risk" : riskScore >= 58 ? "needs-attention" : "safe";
    const baseEffort = assessmentEffortMinutes(assessmentType);
    const prepDays = Math.max(1, Math.min(daysLeft + 1, 7));
    const densityMultiplier = 1 + Math.min(0.5, (density.near7 / 12));
    const riskMultiplier = 0.72 + (riskScore / 100);
    const activityBufferMultiplier = 1 + Math.min(
      0.44,
      (activityStressIndex / 280) + (Math.max(0, personalLoad - 1) * 0.05) + (personalGoalLoad * 0.04) + (attendanceRisk.attendanceRiskIndex / 500)
    );
    let baselineStudyMinutes = Math.round((baseEffort * densityMultiplier * riskMultiplier * activityBufferMultiplier) / prepDays / 5) * 5;
    if (daysLeft === 0) baselineStudyMinutes += 20;
    if (cycleContext?.active && cycleContext.sensitivity === "high") baselineStudyMinutes = Math.round(baselineStudyMinutes * 0.92);
    let upperCap = cycleContext?.active && cycleContext.sensitivity === "high" ? 170 : 220;
    if (isNptelAssignment) upperCap = 30;
    baselineStudyMinutes = clamp(baselineStudyMinutes, 30, upperCap);
    if (isNptelAssignment) baselineStudyMinutes = 30;

    const cycleSessionCap = cycleContext?.active && cycleContext.sensitivity === "high"
      ? 45
      : cycleContext?.active && cycleContext.sensitivity === "medium"
        ? 55
        : 75;
    const maxSession = isNptelAssignment
      ? 30
      : Math.max(35, Math.min(cycleSessionCap, Number(activityContext?.adaptiveSessionCap || 75)));
    let baselineSessionCount = clamp(Math.ceil(baselineStudyMinutes / maxSession), 1, 4);
    if (isNptelAssignment) baselineSessionCount = 1;
    if (String(assessmentType || "").toLowerCase().includes("exam") && riskScore >= 75) {
      baselineSessionCount = Math.max(baselineSessionCount, 2);
    }
    if (activityStressIndex >= 65) {
      baselineSessionCount = Math.min(5, baselineSessionCount + 1);
    }
    if (isNptelAssignment) baselineSessionCount = 1;
    let sessionMinutes = clamp(Math.round((baselineStudyMinutes / baselineSessionCount) / 5) * 5, 25, maxSession);
    if (isNptelAssignment) sessionMinutes = 30;
    const recommendedWindow = chooseRecommendedStudyWindow({
      metrics,
      sleepProfile,
      mealProfile,
      workoutContext,
      activityContext,
      cycleContext,
      daysLeft,
      assessmentType
    });
    const trendBoost = activityContext?.trend === "rising" && daysLeft <= 4 ? 10 : 0;
    const utilityPerSession = clamp(
      Math.round((riskScore * 0.8) + (objectivePriority * 0.5) + (personalLoad * 5) + (activityStressIndex * 0.18) + trendBoost),
      10,
      220
    );
    const mustStart = status === "at-risk"
      || daysLeft <= 1
      || (activityContext?.trend === "rising" && daysLeft <= 3)
      || personalLoad >= 3
      || personalGoalLoad >= 2
      || (attendanceRisk.attendanceRiskIndex >= 70 && daysLeft <= 5);
    const maxSessions = clamp(
      Math.max(1, Math.min(4, Math.ceil(baselineStudyMinutes / sessionMinutes) + (mustStart ? 1 : 0))),
      1,
      5
    );
    const effectiveMaxSessions = isNptelAssignment ? 1 : maxSessions;

    const optimalStart = riskScore >= 85 ? "Now" : riskScore >= 70 ? "Today" : riskScore >= 58 ? "Within 24h" : "Within 48h";
    const title = normalizeDeadlineTitle(row.title);
    const dueCopy = daysLeft === 0 ? "Due today." : daysLeft === 1 ? "Due tomorrow." : `Due in ${daysLeft} days.`;
    const externalCopy = `${providerSummaryLabel(provider)} item.`;
    const contextTags = [];
    if (density.near3 >= 5) contextTags.push("high-deadline-density");
    if (classLoad >= 4) contextTags.push("heavy-class-day");
    if (personalLoad >= 2) contextTags.push("activity-conflict");
    if (personalGoalLoad >= 1) contextTags.push("goal-conflict");
    if (activityStressIndex >= 58) contextTags.push("activity-stress-high");
    if (activityContext?.trend === "rising") contextTags.push("rising-commitments");
    if (attendanceRisk.attendanceRiskIndex >= 62) contextTags.push("attendance-recovery-mode");
    if (cycleContext?.active && cycleContext.sensitivity !== "low") contextTags.push("cycle-sensitive-planning");
    if (sleepProfile?.sleepDebtScore >= 8) contextTags.push("recovery-protection");
    if (adaptivePolicy !== "rule-based") contextTags.push("adaptive-policy-ready");

    const microcopyParts = useCollegeSignals
      ? [
          dueCopy,
          marksPct !== null ? `Marks ${Math.round(marksPct)}%.` : "No marks trend yet.",
          attendancePct !== null ? `Attendance ${Math.round(attendancePct)}%.` : "No attendance trend yet."
        ]
      : [dueCopy, externalCopy];
    if (assessmentType) microcopyParts.push(`Type: ${assessmentType}.`);
    if (contextTags.includes("high-deadline-density")) microcopyParts.push("Deadline density is high this week.");
    if (isNptelAssignment) microcopyParts.push("NPTEL weekly assignment kept to a single quick focus block.");
    if (contextTags.includes("activity-stress-high")) microcopyParts.push("Personal activity load is high, so sessions are split into lighter blocks.");
    if (contextTags.includes("goal-conflict")) microcopyParts.push("Personal goals on calendar are considered while planning this task.");
    if (contextTags.includes("rising-commitments")) microcopyParts.push("Upcoming non-academic commitments are rising, so early starts are prioritized.");
    if (contextTags.includes("attendance-recovery-mode")) microcopyParts.push("Recent missed classes increased buffer needs for upcoming work.");
    if (contextTags.includes("cycle-sensitive-planning")) microcopyParts.push("Cycle-aware pacing enabled.");
    if (contextTags.includes("recovery-protection")) microcopyParts.push("Recovery-aware pacing enabled.");
    if (adaptivePolicy !== "rule-based") microcopyParts.push("Adaptive model can be enabled with larger behavior history.");

    const focusMode = cycleContext?.active && cycleContext.sensitivity === "high"
      ? "Low-strain focus blocks"
      : activityStressIndex >= 65
        ? "Commitment-aware short sprints"
      : riskScore >= 80
        ? "Deep work priority blocks"
        : "Steady progress blocks";

    return {
      id: row.id,
      title,
      source: row.source,
      provider,
      assessmentType,
      dueDateIso,
      daysLeft,
      status,
      optimalStart,
      baselineStudyMinutes,
      recommendedWindow,
      baselineSessionCount,
      sessionMinutes,
      focusMode,
      contextTags,
      subjectName: subject?.subject_name || null,
      marksPercentage: marksPct,
      attendancePercentage: attendancePct,
      riskScore,
      objectivePriority,
      utilityPerSession,
      maxSessions: effectiveMaxSessions,
      mustStart,
      upperCap,
      microcopy: microcopyParts.join(" ")
    };
  });

  const mipBudgetMinutes = computePlanningCapacityMinutes({
    sleepProfile,
    workoutContext,
    cycleContext,
    activityContext
  });
  const mipResult = optimizeSessionsWithMIP(preItems, mipBudgetMinutes);

  const items = preItems.map((item) => {
    const allocatedSessions = Number(mipResult.allocation.get(item.id) || 0);
    const effectiveSessions = item.mustStart ? Math.max(1, allocatedSessions) : allocatedSessions;
    const sessionCount = clamp(effectiveSessions, item.mustStart ? 1 : 0, item.maxSessions);
    const rawMinutes = sessionCount * item.sessionMinutes;
    const studyMinutesPerDay = item.mustStart
      ? clamp(rawMinutes, item.sessionMinutes, item.upperCap)
      : clamp(rawMinutes, 0, item.upperCap);

    return {
      id: item.id,
      title: item.title,
      source: item.source,
      provider: item.provider,
      assessmentType: item.assessmentType,
      dueDateIso: item.dueDateIso,
      daysLeft: item.daysLeft,
      status: item.status,
      optimalStart: item.optimalStart,
      studyMinutesPerDay,
      recommendedWindow: item.recommendedWindow,
      sessionCount,
      sessionMinutes: item.sessionMinutes,
      focusMode: item.focusMode,
      contextTags: item.contextTags,
      subjectName: item.subjectName,
      marksPercentage: item.marksPercentage,
      attendancePercentage: item.attendancePercentage,
      riskScore: item.riskScore,
      objectivePriority: item.objectivePriority,
      microcopy: item.microcopy
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    modelMetadata: {
      methods: [
        "mixed-integer-programming",
        "multi-objective-optimization",
        "bayesian-updating",
        "time-series-forecasting",
        "constraint-aware-scheduling",
        "activity-pattern-adaptation"
      ],
      adaptivePolicyMode: adaptivePolicy,
      rlDataPoints,
      bayesianPosteriorSuccess: bayesian.posteriorSuccess,
      timeSeriesPressureIndex: tsPressure.pressureIndex,
      activityStressIndex,
      attendanceRiskIndex: attendanceRisk.attendanceRiskIndex,
      recentMissRate: attendanceRisk.observedMissRate,
      activityTrend: activityContext?.trend || "stable",
      personalGoalLoadToday: Number(activityContext?.todayGoalLoad || 0),
      activityAdaptiveSessionCap: Number(activityContext?.adaptiveSessionCap || 70),
      objectiveWeights,
      mipBudgetMinutes: mipResult.budgetMinutes,
      mipUsedMinutes: mipResult.usedMinutes
    },
    sensitivityLayer: cycleContext?.active
      ? {
          mode: "cycle-aware",
          phase: cycleContext.phase,
          cycleDay: cycleContext.cycleDay,
          cycleLength: cycleContext.cycleLength,
          sensitivity: cycleContext.sensitivity,
          note: cycleContext.note
        }
      : null,
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

function weightedAverage(pairs) {
  const valid = (pairs || []).filter((pair) => Number.isFinite(Number(pair?.value)) && Number.isFinite(Number(pair?.weight)) && Number(pair.weight) > 0);
  if (!valid.length) return null;
  const totalWeight = valid.reduce((sum, pair) => sum + Number(pair.weight), 0);
  if (totalWeight <= 0) return null;
  const weightedSum = valid.reduce((sum, pair) => sum + Number(pair.value) * Number(pair.weight), 0);
  return weightedSum / totalWeight;
}

function getIstDateOnly(daysOffset = 0) {
  const now = new Date();
  const shifted = new Date(now.getTime() + (Number(daysOffset || 0) * 24 * 60 * 60 * 1000));
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(shifted);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function shiftIsoDate(dateIso, offsetDays) {
  const [y, m, d] = String(dateIso || "").split("-").map((v) => Number(v));
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  if (Number.isNaN(dt.getTime())) {
    return String(dateIso || "").slice(0, 10);
  }
  dt.setUTCDate(dt.getUTCDate() + Number(offsetDays || 0));
  return dt.toISOString().slice(0, 10);
}

function listIsoDatesInclusive(fromIso, toIso) {
  const out = [];
  let cursor = String(fromIso || "");
  const limit = 2000;
  let loops = 0;
  while (cursor <= toIso && loops < limit) {
    out.push(cursor);
    const next = shiftIsoDate(cursor, 1);
    if (next === cursor) break;
    cursor = next;
    loops += 1;
  }
  return out;
}

function toMapByDay(rows) {
  const toDayKey = (value) => {
    if (!value) return "";
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10);
    }
    const text = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return text.slice(0, 10);
  };
  return new Map((rows || []).map((row) => [toDayKey(row.day), row]));
}

function scoreAcademicDay(attendanceRow, goalRow) {
  const total = Number(attendanceRow?.total_classes || 0);
  const attended = Number(attendanceRow?.attended_count || 0);
  const todayAttendanceScore = total > 0
    ? clamp((attended / total) * 100, 0, 100)
    : null;

  const goalTotal = Number(goalRow?.total_goals || 0);
  const goalAchieved = Number(goalRow?.achieved_count || 0);
  const todayGoalScore = goalTotal > 0
    ? clamp((goalAchieved / goalTotal) * 100, 0, 100)
    : null;

  if (todayAttendanceScore !== null && todayGoalScore !== null) {
    const attendanceWeight = DAILY_TUNING.academicAttendanceWeight;
    const goalWeight = DAILY_TUNING.academicGoalWeight;
    const totalWeight = attendanceWeight + goalWeight;
    if (totalWeight <= 0) return todayAttendanceScore;
    return clamp(
      ((todayAttendanceScore * attendanceWeight) + (todayGoalScore * goalWeight)) / totalWeight,
      0,
      100
    );
  }

  return todayAttendanceScore ?? todayGoalScore ?? null;
}

function scoreFitnessDay(workoutRow, fitRow) {
  const totalActions = Number(workoutRow?.total_actions || 0);
  const skipped = Number(workoutRow?.skipped_count || 0);
  const actionScore = totalActions > 0 ? clamp((1 - (skipped / totalActions)) * 100, 0, 100) : null;

  const steps = fitRow?.steps === null || fitRow?.steps === undefined ? null : Number(fitRow.steps);
  const calories = fitRow?.calories === null || fitRow?.calories === undefined ? null : Number(fitRow.calories);
  const stepScore = steps === null ? null : clamp((steps / DAILY_TUNING.stepsTarget) * 100, 0, 100);
  const calorieScore = calories === null ? null : clamp((calories / DAILY_TUNING.caloriesTarget) * 100, 0, 100);
  const fitScore = average([stepScore, calorieScore]);

  if (actionScore !== null && fitScore !== null) {
    return clamp(
      (actionScore * DAILY_TUNING.fitnessActionWeight) + (fitScore * DAILY_TUNING.fitnessFitWeight),
      0,
      100
    );
  }
  return actionScore ?? fitScore ?? null;
}

function scoreNutritionDay(nutritionRow) {
  const calories = nutritionRow?.calories_total === null || nutritionRow?.calories_total === undefined
    ? null
    : Number(nutritionRow.calories_total);
  const protein = nutritionRow?.protein_total === null || nutritionRow?.protein_total === undefined
    ? null
    : Number(nutritionRow.protein_total);
  if (calories === null && protein === null) return null;

  const proteinScore = protein === null ? null : clamp((protein / DAILY_TUNING.proteinTarget) * 100, 0, 100);
  const calorieScore = calories === null
    ? null
    : (
      calories >= DAILY_TUNING.calorieMin && calories <= DAILY_TUNING.calorieMax
        ? 100
        : clamp(
          100 - ((Math.min(
            Math.abs(calories - DAILY_TUNING.calorieMin),
            Math.abs(calories - DAILY_TUNING.calorieMax)
          ) / DAILY_TUNING.calorieMax) * 100),
          0,
          100
        )
    );
  const value = average([proteinScore, calorieScore]);
  return value === null ? null : clamp(value, 0, 100);
}

function resolveDailyDomainScoreDetailed(todayRaw, previousAvg, fallback) {
  const hasToday = todayRaw !== null && todayRaw !== undefined && Number.isFinite(Number(todayRaw));
  const hasPrevious = previousAvg !== null && previousAvg !== undefined && Number.isFinite(Number(previousAvg));
  const hasFallback = fallback !== null && fallback !== undefined && Number.isFinite(Number(fallback));

  if (hasToday) {
    return { value: clamp(Number(todayRaw), 0, 100), source: "today" };
  }
  if (hasPrevious) {
    return { value: clamp(Number(previousAvg), 0, 100), source: "previous_avg" };
  }
  if (hasFallback && Number(fallback) > 0) {
    return { value: clamp(Number(fallback), 0, 100), source: "historical_fallback" };
  }
  return { value: DAILY_TUNING.defaultNeutral, source: "default_neutral" };
}

async function computeDailyOptimization(userId, fallbackIndexes) {
  const todayIso = getIstDateOnly(0);
  const fromIso = getIstDateOnly(-7);
  const [attendanceRows, workoutRows, nutritionRows, fitRows, goalRows] = await Promise.all([
    behaviorModel.listAttendanceDailySeries(userId, fromIso, todayIso),
    behaviorModel.listWorkoutDailySeries(userId, fromIso, todayIso),
    behaviorModel.listNutritionDailySeries(userId, fromIso, todayIso),
    behaviorModel.listFitDailySeries(userId, fromIso, todayIso),
    behaviorModel.listAcademicGoalDailySeries(userId, fromIso, todayIso)
  ]);

  const attendanceByDay = toMapByDay(attendanceRows);
  const workoutByDay = toMapByDay(workoutRows);
  const nutritionByDay = toMapByDay(nutritionRows);
  const fitByDay = toMapByDay(fitRows);
  const goalsByDay = toMapByDay(goalRows);
  const dates = listIsoDatesInclusive(fromIso, todayIso);

  const daily = dates.map((date) => ({
    date,
    academicRaw: scoreAcademicDay(attendanceByDay.get(date), goalsByDay.get(date)),
    fitnessRaw: scoreFitnessDay(workoutByDay.get(date), fitByDay.get(date)),
    nutritionRaw: scoreNutritionDay(nutritionByDay.get(date))
  }));

  const today = daily[daily.length - 1] || { academicRaw: null, fitnessRaw: null, nutritionRaw: null };
  const previous = daily.slice(0, -1);

  const previousAcademicAvg = average(previous.map((row) => row.academicRaw));
  const previousFitnessAvg = average(previous.map((row) => row.fitnessRaw));
  const previousNutritionAvg = average(previous.map((row) => row.nutritionRaw));

  const academicResolved = resolveDailyDomainScoreDetailed(
    today.academicRaw,
    previousAcademicAvg,
    fallbackIndexes.academicScoreIndex
  );
  const fitnessResolved = resolveDailyDomainScoreDetailed(
    today.fitnessRaw,
    previousFitnessAvg,
    fallbackIndexes.fitnessDisciplineIndex
  );
  const nutritionResolved = resolveDailyDomainScoreDetailed(
    today.nutritionRaw,
    previousNutritionAvg,
    fallbackIndexes.nutritionBalanceIndex
  );

  const academicScoreIndex = Number(academicResolved.value.toFixed(2));
  const fitnessDisciplineIndex = Number(fitnessResolved.value.toFixed(2));
  const nutritionBalanceIndex = Number(nutritionResolved.value.toFixed(2));

  const weightedOverall = weightedAverage([
    { value: academicScoreIndex, weight: DAILY_TUNING.overallAcademicWeight },
    { value: fitnessDisciplineIndex, weight: DAILY_TUNING.overallFitnessWeight },
    { value: nutritionBalanceIndex, weight: DAILY_TUNING.overallNutritionWeight }
  ]);
  const overallConsistencyIndex = Number((weightedOverall === null ? DAILY_TUNING.defaultNeutral : weightedOverall).toFixed(2));

  const previousDailyOverall = previous
    .map((row) => {
      const a = resolveDailyDomainScoreDetailed(row.academicRaw, previousAcademicAvg, fallbackIndexes.academicScoreIndex).value;
      const f = resolveDailyDomainScoreDetailed(row.fitnessRaw, previousFitnessAvg, fallbackIndexes.fitnessDisciplineIndex).value;
      const n = resolveDailyDomainScoreDetailed(row.nutritionRaw, previousNutritionAvg, fallbackIndexes.nutritionBalanceIndex).value;
      return weightedAverage([
        { value: a, weight: DAILY_TUNING.overallAcademicWeight },
        { value: f, weight: DAILY_TUNING.overallFitnessWeight },
        { value: n, weight: DAILY_TUNING.overallNutritionWeight }
      ]);
    })
    .filter((value) => Number.isFinite(Number(value)));

  const previousOverallAvgRaw = average(previousDailyOverall);
  const previousOverallAvg = previousOverallAvgRaw === null
    ? overallConsistencyIndex
    : Number(previousOverallAvgRaw.toFixed(2));
  const delta = Number((overallConsistencyIndex - previousOverallAvg).toFixed(2));
  const trend = delta > DAILY_TUNING.trendDeltaThreshold
    ? "improving"
    : delta < -DAILY_TUNING.trendDeltaThreshold
      ? "declining"
      : "steady";

  return {
    date: todayIso,
    previousWindowDays: 7,
    previousOverallAvg,
    delta,
    trend,
    sources: {
      academic: academicResolved.source,
      fitness: fitnessResolved.source,
      nutrition: nutritionResolved.source
    },
    summary: {
      academic_score_index: academicScoreIndex,
      fitness_discipline_index: fitnessDisciplineIndex,
      nutrition_balance_index: nutritionBalanceIndex,
      overall_consistency_index: overallConsistencyIndex
    }
  };
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

function buildWarnings({ metrics, deadlineIntelligence, nutritionSnapshot, cycleContext }) {
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

  if (cycleContext?.active && cycleContext.sensitivity === "high") {
    warnings.push({
      id: "warn-cycle-sensitive",
      domain: "health",
      severity: "medium",
      text: toSensitiveCopy(
        "Cycle-aware support is active; planning uses shorter study blocks with extra recovery buffers.",
        { menstrualContext: true }
      )
    });
  }

  return warnings.map((warning) => ({
    ...warning,
    text: toSensitiveCopy(warning.text, { menstrualContext: warning.id === "warn-cycle-sensitive" })
  }));
}

function buildInsights({ metrics, subjectSignals, deadlineIntelligence, cycleContext }) {
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

  if (cycleContext?.active) {
    insights.push({
      id: "insight-cycle-aware",
      domain: "health",
      text: toSensitiveCopy(
        cycleContext.sensitivity === "high"
          ? `Cycle-aware planner is in ${cycleContext.phase} phase (day ${cycleContext.cycleDay}). It is prioritizing sustainable focus windows.`
          : `Cycle-aware planner is active (${cycleContext.phase} phase, day ${cycleContext.cycleDay}).`,
        { menstrualContext: true }
      )
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: "insight-empty",
      domain: "cross_domain",
      text: "No strong trend is visible yet; continued daily logging may improve insight quality."
    });
  }

  return insights.slice(0, 4).map((insight) => ({
    ...insight,
    text: toSensitiveCopy(insight.text, { menstrualContext: insight.id === "insight-cycle-aware" })
  }));
}

function buildRecommendations(metrics) {
  const recommendations = [];

  if (metrics.fitness && Number(metrics.fitness.skip_rate) > 0.6) {
    recommendations.push({
      id: createId("rec"),
      domain: "fitness",
      text: "Your skip rate is above 60%. Reschedule workouts to your best completion hour."
    });
  }

  if (metrics.fitness && Number(metrics.fitness.exam_week_drop_percentage) > 30) {
    recommendations.push({
      id: createId("rec"),
      domain: "fitness",
      text: "Exam weeks reduce workout consistency significantly. Switch to short maintenance sessions during exam weeks."
    });
  }

  if (metrics.academic && Number(metrics.academic.avg_attendance) < 0.75) {
    recommendations.push({
      id: createId("rec"),
      domain: "academic",
      text: "Attendance is below 75%. Prioritize attendance-critical classes this week."
    });
  }

  if (metrics.nutrition && Number(metrics.nutrition.protein_deficit_ratio) > 0.4) {
    recommendations.push({
      id: createId("rec"),
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
      id: createId("rec"),
      domain: "cross_domain",
      text: "Attendance pressure and workout skips are rising together. Use a lighter workout on heavy academic days."
    });
  }

  return recommendations.map((recommendation) => ({
    ...recommendation,
    text: toSensitiveCopy(recommendation.text)
  }));
}

async function enrichBehaviorSummary(userId, base, range = "all") {
  const rangeConfig = resolveRange(range);
  const windowDays = rangeConfig.days;
  const sinceDate = sinceDateIso(windowDays);
  const todayIso = getIstDateOnly(0);
  const contextFromIso = shiftIsoDate(todayIso, -90);
  const contextToIso = shiftIsoDate(todayIso, 30);
  const metrics = await behaviorModel.getMetricsForSummary(userId);
  const subjectSignals = await behaviorModel.listSubjectSignals(userId, sinceDate);
  const deadlines = await behaviorModel.listUpcomingAcademicDeadlines(userId, 20);
  const timetableLoad = await behaviorModel.getTimetableLoadByDay(userId);
  const workoutSnapshot = await behaviorModel.getRecentWorkoutSnapshot(userId, windowDays);
  const attendanceSnapshot = await behaviorModel.getRecentAttendanceSnapshot(userId, windowDays);
  const nutritionSnapshot = await behaviorModel.getNutritionSnapshot(userId, windowDays);
  const marksTrend = await behaviorModel.getRecentMarksTrend(userId, windowDays);
  const ranks = await behaviorModel.getCohortRanks(userId);
  const [workoutPlan, calendarEvents, foodTimeRows, sleepSessions] = await Promise.all([
    workoutPlanModel.getLatestWorkoutPlan(userId).catch(() => null),
    behaviorModel.listCalendarEventsRange(userId, contextFromIso, contextToIso, 1200).catch(() => []),
    behaviorModel.listFoodImageTimes(userId, 45).catch(() => []),
    behaviorModel.listSleepActivitySessions(userId, 90).catch(() => [])
  ]);
  const workoutContext = deriveWorkoutContext(workoutPlan);
  const mealProfile = deriveMealTimingProfile(foodTimeRows);
  const sleepProfile = deriveSleepTimingProfile(sleepSessions);
  const cycleContext = deriveCycleContext(calendarEvents, todayIso);
  const activityContext = deriveActivityContext(calendarEvents, todayIso);

  const computedScores = computeScoreIndexes(metrics);
  const rangeScores = computeScoreIndexesFromRange({
    subjectSignals,
    attendanceSnapshot,
    workoutSnapshot,
    nutritionSnapshot,
    fallbackIndexes: computedScores
  });
  const dailyOptimization = await computeDailyOptimization(userId, computedScores);

  const summary = rangeConfig.key === "all"
    ? dailyOptimization.summary
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
    metrics,
    workoutContext,
    mealProfile,
    sleepProfile,
    activityContext,
    cycleContext,
    workoutSnapshot,
    attendanceSnapshot,
    nutritionSnapshot
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
    }).map((reason) => ({
      ...reason,
      description: toSensitiveCopy(reason.description)
    })),
    warnings: buildWarnings({ metrics, deadlineIntelligence, nutritionSnapshot, cycleContext }),
    insights: buildInsights({ metrics, subjectSignals, deadlineIntelligence, cycleContext }),
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
    dailyOptimization,
    recommendations: (base.recommendations || []).map((item) => ({
      ...item,
      recommendation_text: toSensitiveCopy(item.recommendation_text)
    })),
    scorecards,
    behaviorAnalysis,
    deadlineIntelligence: {
      ...deadlineIntelligence,
      items: (deadlineIntelligence.items || []).map((item) => ({
        ...item,
        microcopy: toSensitiveCopy(item.microcopy, { menstrualContext: item.contextTags?.includes("cycle-sensitive-planning") })
      })),
      sensitivityLayer: deadlineIntelligence.sensitivityLayer
        ? {
            ...deadlineIntelligence.sensitivityLayer,
            note: toSensitiveCopy(deadlineIntelligence.sensitivityLayer.note, { menstrualContext: true })
          }
        : null
    }
  };
}

async function recomputeBehaviorSummary(userId) {
  const metrics = await behaviorModel.getMetricsForSummary(userId);
  const computedScores = computeScoreIndexes(metrics);
  const subjectSignals = await behaviorModel.listSubjectSignals(userId, null);
  const workoutSnapshot = await behaviorModel.getRecentWorkoutSnapshot(userId, 30);
  const attendanceSnapshot = await behaviorModel.getRecentAttendanceSnapshot(userId, 30);
  const nutritionSnapshot = await behaviorModel.getNutritionSnapshot(userId, 30);
  const rangeScores = computeScoreIndexesFromRange({
    subjectSignals,
    attendanceSnapshot,
    workoutSnapshot,
    nutritionSnapshot,
    fallbackIndexes: computedScores
  });
  const academicScoreIndex = rangeScores.academicScoreIndex;
  const fitnessDisciplineIndex = rangeScores.fitnessDisciplineIndex;
  const nutritionBalanceIndex = rangeScores.nutritionBalanceIndex;

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
  const hasStoredSummary = Boolean(base?.summary);
  const storedLooksEmpty = hasStoredSummary
    ? (
      Number(base.summary.academic_score_index || 0) <= 0
      && Number(base.summary.fitness_discipline_index || 0) <= 0
      && Number(base.summary.nutrition_balance_index || 0) <= 0
      && Number(base.summary.overall_consistency_index || 0) <= 0
    )
    : false;

  if ((!hasStoredSummary || storedLooksEmpty) && rangeConfig.key === "all") {
    const subjectSignals = await behaviorModel.listSubjectSignals(userId, null);
    const hasLiveSignals = subjectSignals.some((row) => row.attendance_percentage !== null || row.marks_percentage !== null);
    const metrics = await behaviorModel.getMetricsForSummary(userId);
    if (metrics.academic || metrics.fitness || metrics.nutrition || hasLiveSignals) {
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
  recomputeAllBehaviorSummaries,
  __test: {
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
  }
};
