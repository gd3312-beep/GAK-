import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  Clock,
  BookOpen,
  FileEdit,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Zap,
  Menu,
  Activity,
  Utensils,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import BottomNav from "@/components/BottomNav";
import { ProfileMenu } from "@/components/ProfileMenu";
import { DayGoalsPopup } from "@/components/DayGoalsPopup";
import { SwipeContainer } from "@/components/SwipeContainer";
import { apiRequest, getSessionUser } from "@/lib/api";

type EventRow = {
  event_id: string;
  event_date: string;
  event_type: string;
  title: string;
  google_event_id: string | null;
  sync_status: "pending" | "synced" | "failed";
};

type TimetableRow = {
  timetable_entry_id: string;
  day_order: number | null;
  start_time: string | null;
  end_time: string | null;
  subject_name: string;
  faculty_name?: string | null;
  room_number?: string | null;
};

type WorkoutToday = {
  hasPlan: boolean;
  isScheduledForDay: boolean;
  plan?: {
    planId: string;
    planName: string | null;
    startTime: string | null;
    endTime: string | null;
    estimatedCaloriesBurned?: number | null;
    preWorkoutMealTime?: string | null;
    preWorkoutMealText?: string | null;
    postWorkoutMealTime?: string | null;
    postWorkoutMealText?: string | null;
  } | null;
};

type DayGoal = { type: "gyaan" | "karma" | "ahara" | "personal"; summary: string };
type AnalyticsPayload = {
  deadlineIntelligence?: {
    modelMetadata?: {
      attendanceRiskIndex?: number;
      recentMissRate?: number;
      activityStressIndex?: number;
      personalGoalLoadToday?: number;
    } | null;
    sensitivityLayer?: {
      mode: string;
      phase?: string | null;
      cycleDay?: number | null;
      cycleLength?: number | null;
      sensitivity?: string | null;
      note?: string | null;
    } | null;
    items: Array<{
      id: string;
      title: string;
      source?: string;
      provider?: string;
      assessmentType?: string | null;
      dueDateIso?: string;
      daysLeft: number;
      status: "safe" | "needs-attention" | "at-risk";
      optimalStart: string;
      studyMinutesPerDay: number;
      recommendedWindow: string;
      sessionCount?: number;
      sessionMinutes?: number;
      focusMode?: string;
      contextTags?: string[];
      microcopy: string;
    }>;
    noDataMessage?: string | null;
  };
};

function formatDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function humanDueLabel(days: number) {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

function isLikelyAcademicTitle(value: string) {
  const text = String(value || "").toLowerCase();
  return /(assignment|due|submission|quiz|test|internal|midsem|endsem|exam|viva|project|lab|classroom|nptel|registration|last date|last day|course|semester|cie|cat|ft-i|ft-ii)/i.test(text);
}

function isPersonalGoalTitle(value: string) {
  const text = String(value || "").toLowerCase();
  return /\b(goal|milestone|target|habit|practice|portfolio|personal project|side project|interview prep)\b/.test(text);
}

function inferAcademicSource(value: string, fallbackSource?: string | null) {
  const text = String(value || "").toLowerCase();
  const source = String(fallbackSource || "").toLowerCase();
  if (
    text.includes("nptel")
    || /week\s*\d+/.test(text)
    || /content\s*&\s*assignment/.test(text)
  ) return "NPTEL";
  if (
    text.includes("classroom")
    || text.includes("google classroom")
    || text.includes("classwork")
    || text.includes("posted a new assignment")
    || text.includes("material posted")
  ) return "Classroom";
  if (text.includes("exam registration") || text.includes("ft-i") || text.includes("ft-ii") || text.includes("internal")) return "College";
  if (source === "calendar") return "College";
  if (source === "gmail") return "Email";
  return "Academic";
}

function normalizeDeadlineTitle(value: string) {
  return String(value || "")
    .replace(/^study\s*:\s*/i, "")
    .replace(/^deadline\s*prep\s*:\s*/i, "")
    .replace(/^reminder\s*:\s*/i, "")
    .replace(/\bcontent\s*&\s*assignment\b/ig, "Assignment")
    .replace(/\bis\s+live\s+now\b/ig, "")
    .replace(/\s*!+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeWorkoutTitle(value: string | null | undefined) {
  return String(value || "")
    .replace(/\(\s*with\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseStartMinutes(label: string) {
  const text = String(label || "").trim();
  if (!text || /^anytime$/i.test(text)) return 24 * 60 + 59;

  const rangeMatch = text.match(/^(\d{2}):(\d{2})\s*-\s*\d{2}:\d{2}$/);
  if (rangeMatch) {
    return Number(rangeMatch[1]) * 60 + Number(rangeMatch[2]);
  }

  const hhmmMatch = text.match(/^(\d{2}):(\d{2})$/);
  if (hhmmMatch) {
    return Number(hhmmMatch[1]) * 60 + Number(hhmmMatch[2]);
  }

  const meridiemMatch = text.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (meridiemMatch) {
    const hour12 = Number(meridiemMatch[1]) % 12;
    const mins = Number(meridiemMatch[2]);
    const isPm = String(meridiemMatch[3]).toUpperCase() === "PM";
    return (hour12 + (isPm ? 12 : 0)) * 60 + mins;
  }

  return 24 * 60 + 58;
}

function inferAssessmentType(value: string) {
  const text = String(value || "").toLowerCase();
  // Handles common user-entered variants: ft-1, ft 1, ft1, ft-ii, etc.
  if (/\bft[\s-]*i\b|\bft[\s-]*1\b|\bft1\b/i.test(text)) return "FT-1";
  if (/\bft[\s-]*ii\b|\bft[\s-]*2\b|\bft2\b/i.test(text)) return "FT-2";
  if (/\bpresentation\b|\bppt\b|\bseminar\b/i.test(text)) return "Presentation";
  if (/\bwritten\s*test\b|\bdescriptive\b/i.test(text)) return "Written Test";
  if (/\bonline\s*test\b|\bquiz\b|\bmcq\b/i.test(text)) return "Online Test";
  if (/\bpractical\b|\blab\b|\bviva\b/i.test(text)) return "Practical / Viva";
  if (/\bassignment\b|\bsubmission\b|\bdue\b|\bdeadline\b/i.test(text)) return "Assignment";
  if (/\bexam\s*registration\b|\bregistration\b/i.test(text)) return "Registration";
  if (/\bendsem\b|\bmidsem\b|\bexam\b/i.test(text)) return "Exam";
  return null;
}

function providerLabelFromValue(provider: string | undefined, title: string, source?: string | null) {
  const p = String(provider || "").toLowerCase();
  if (p === "nptel") return "NPTEL";
  if (p === "classroom") return "Google Classroom";
  if (p === "college") return "College";
  return inferAcademicSource(title, source || null);
}

function dedupeDeadlineItems(items: NonNullable<AnalyticsPayload["deadlineIntelligence"]>["items"]) {
  const seen = new Set<string>();
  return (items || []).filter((item) => {
    const key = `${normalizeDeadlineTitle(item.title).toLowerCase()}::${String(item.dueDateIso || "").slice(0, 10)}::${String(item.provider || "").toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseSqlTimeToMinutes(value: string | null | undefined) {
  const raw = String(value || "").trim();
  const m = raw.match(/^(\d{2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function minutesToLabel(totalMinutes: number) {
  const clamped = Math.max(0, Math.min(totalMinutes, 23 * 60 + 59));
  const hh = String(Math.floor(clamped / 60)).padStart(2, "0");
  const mm = String(clamped % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatIsoDate(iso: string | null | undefined) {
  const text = String(iso || "").slice(0, 10);
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return text || "Unknown";
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getTodayDayOrder(date: Date) {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

function timeLabel(start: string | null, end: string | null) {
  const s = start ? String(start).slice(0, 5) : null;
  const e = end ? String(end).slice(0, 5) : null;
  if (s && e) return `${s} - ${e}`;
  if (s) return s;
  return "Anytime";
}

function timeOnlyLabel(value: string | null) {
  if (!value) return "Anytime";
  const text = String(value);
  const m = text.match(/^(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : text;
}

const Planner = () => {
  const navigate = useNavigate();
  const user = getSessionUser();

  const [viewMode, setViewMode] = useState<"calendar" | "ai">("ai");
  const [menuOpen, setMenuOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const [showAiDetails, setShowAiDetails] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [taskSyncBusy, setTaskSyncBusy] = useState(false);
  const [taskSyncMessage, setTaskSyncMessage] = useState<string | null>(null);
  const [docExportBusy, setDocExportBusy] = useState(false);
  const [docExportMessage, setDocExportMessage] = useState<string | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [timetableRows, setTimetableRows] = useState<TimetableRow[]>([]);
  const [todayWorkout, setTodayWorkout] = useState<WorkoutToday | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError("");
      // Keep Planner DB calendar in sync with Google Calendar without changing UI.
      const syncKey = "gak_calendar_sync_at";
      const lastSync = Number(window.localStorage.getItem(syncKey) || 0);
      const sixHours = 6 * 60 * 60 * 1000;
      if (!Number.isFinite(lastSync) || Date.now() - lastSync > sixHours) {
        await apiRequest("/api/integrations/calendar/sync", { method: "POST" }).catch(() => undefined);
        window.localStorage.setItem(syncKey, String(Date.now()));
      }
      const [eventsResp, analyticsResp, timetableResp, todayWorkoutResp] = await Promise.all([
        apiRequest<EventRow[]>("/api/integrations/calendar/events"),
        apiRequest<AnalyticsPayload>("/api/advanced-analytics/behavior-summary").catch(() => ({})),
        apiRequest<TimetableRow[]>(`/api/academic/timetable/${user.userId}`).catch(() => []),
        apiRequest<WorkoutToday>("/api/fitness/workout/today").catch(() => ({ hasPlan: false, isScheduledForDay: false }))
      ]);
      setEvents(eventsResp);
      setAnalytics(analyticsResp);
      setTimetableRows(timetableResp || []);
      setTodayWorkout(todayWorkoutResp || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load planner");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      navigate("/auth?mode=signin");
      return;
    }
    void load();
  }, [load, navigate, user]);

  const getTypeStyles = (type: string) => {
    switch (type) {
      case "study":
        return { bg: "bg-gyaan/10", border: "border-l-gyaan", icon: BookOpen, color: "text-gyaan" };
      case "assignment":
        return { bg: "bg-gyaan/10", border: "border-l-gyaan", icon: FileEdit, color: "text-gyaan" };
      case "break":
        return { bg: "bg-karma/10", border: "border-l-karma", icon: RefreshCw, color: "text-karma" };
      case "workout":
        return { bg: "bg-karma/10", border: "border-l-karma", icon: Activity, color: "text-karma" };
      case "meal":
        return { bg: "bg-ahara/10", border: "border-l-ahara", icon: Utensils, color: "text-ahara" };
      case "buffer":
        return { bg: "bg-secondary", border: "border-l-muted-foreground", icon: Clock, color: "text-muted-foreground" };
      default:
        return { bg: "bg-secondary", border: "border-l-border", icon: Clock, color: "text-muted-foreground" };
    }
  };

  const getStatusStyles = (statusValue: string) => {
    switch (statusValue) {
      case "safe":
        return { bg: "bg-safe/10", color: "text-safe", icon: CheckCircle };
      case "needs-attention":
        return { bg: "bg-warning/10", color: "text-warning", icon: AlertTriangle };
      case "at-risk":
        return { bg: "bg-critical/10", color: "text-critical", icon: AlertTriangle };
      default:
        return { bg: "bg-secondary", color: "text-muted-foreground", icon: Clock };
    }
  };

  const getEventTypeColor = (type: string) => {
    switch (type) {
      case "gyaan":
        return "bg-gyaan";
      case "karma":
        return "bg-karma";
      case "ahara":
        return "bg-ahara";
      case "personal":
        return "bg-purple-500";
      default:
        return "bg-gak";
    }
  };

  const calendarGoals = useMemo(() => {
    const map = new Map<string, DayGoal[]>();

    for (const event of events) {
      const dateKey = String(event.event_date).slice(0, 10);
      if (event.event_type === "academic" && !isLikelyAcademicTitle(event.title)) {
        continue;
      }
      const t =
        event.event_type === "academic"
          ? "gyaan"
          : event.event_type === "fitness"
            ? "karma"
            : event.event_type === "nutrition"
              ? "ahara"
              : "personal";
      const list = map.get(dateKey) || [];
      list.push({ type: t, summary: event.title });
      map.set(dateKey, list);
    }

    return map;
  }, [events]);

  const today = useMemo(() => new Date(), []);
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();
    return { daysInMonth, startingDay };
  };

  const { daysInMonth, startingDay } = getDaysInMonth(currentMonth);

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  const isToday = (day: number) => {
    return day === today.getDate() && currentMonth.getMonth() === today.getMonth() && currentMonth.getFullYear() === today.getFullYear();
  };

  const handleDateClick = (day: number) => {
    const clickedDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    setSelectedDate(clickedDate);
    setPopupOpen(true);
  };

  const getGoalsForDate = (date: Date | null) => {
    if (!date) return [];
    const key = formatDateKey(date.getFullYear(), date.getMonth(), date.getDate());
    return calendarGoals.get(key) || [];
  };

  const aiSchedule = useMemo(() => {
    const todayKey = formatDateKey(today.getFullYear(), today.getMonth(), today.getDate());
    const dayOrder = getTodayDayOrder(today);

    type ScheduleItem = {
      id: string;
      time: string;
      duration: string;
      title: string;
      type: string;
      aiReason: string;
      domainLabel: string;
      sourceLabel: string;
      assessmentLabel?: string | null;
    };

    const busyIntervals: Array<{ start: number; end: number }> = [];
    const attendanceRisk = Number(analytics?.deadlineIntelligence?.modelMetadata?.attendanceRiskIndex || 0);
    const todayPersonalEvents = (events || []).filter((event) => {
      const eventDateIso = String(event.event_date || "").slice(0, 10);
      if (eventDateIso !== todayKey) return false;
      const type = String(event.event_type || "").toLowerCase();
      return type !== "academic" && type !== "fitness" && type !== "nutrition";
    });
    const todayPersonalGoalCount = todayPersonalEvents.filter((event) => isPersonalGoalTitle(event.title)).length;
    const personalLoadScore = todayPersonalEvents.length + (todayPersonalGoalCount * 0.7);
    const personalCompression = personalLoadScore >= 4 ? 0.58 : personalLoadScore >= 2 ? 0.74 : personalLoadScore >= 1 ? 0.88 : 1;
    const attendanceRecoveryBoost = attendanceRisk >= 70 ? 1.15 : attendanceRisk >= 55 ? 1.08 : 1;

    const classItems = (timetableRows || [])
      .filter((row) => Number(row.day_order) === dayOrder)
      .sort((a, b) => String(a.start_time || "").localeCompare(String(b.start_time || "")))
      .map((row, idx) => {
        const startMin = parseSqlTimeToMinutes(row.start_time);
        const endMin = parseSqlTimeToMinutes(row.end_time);
        if (startMin !== null && endMin !== null && endMin > startMin) {
          busyIntervals.push({ start: startMin, end: endMin });
        }
        return {
          id: `${todayKey}-class-${idx}-${row.timetable_entry_id}`,
          time: timeLabel(row.start_time || null, row.end_time || null),
          duration: "--",
          title: row.subject_name,
          type: "study",
          aiReason: [row.room_number, row.faculty_name].filter(Boolean).join(" • ") || "From timetable",
          domainLabel: "Academic",
          sourceLabel: "Class"
        };
      });

    const workoutItems = todayWorkout?.hasPlan && todayWorkout?.isScheduledForDay
      ? (() => {
          const startMin = parseSqlTimeToMinutes(todayWorkout.plan?.startTime || null);
          const endMin = parseSqlTimeToMinutes(todayWorkout.plan?.endTime || null);
          if (startMin !== null && endMin !== null && endMin > startMin) {
            busyIntervals.push({ start: startMin, end: endMin });
          }
          return [{
            id: `${todayKey}-workout`,
            time: timeLabel(todayWorkout.plan?.startTime || null, todayWorkout.plan?.endTime || null),
            duration: "--",
            title: normalizeWorkoutTitle(todayWorkout.plan?.planName) || "Workout session",
            type: "workout",
            aiReason: todayWorkout.plan?.estimatedCaloriesBurned
              ? `From your workout plan • ~${Math.round(Number(todayWorkout.plan.estimatedCaloriesBurned))} kcal`
              : "From your workout plan",
            domainLabel: "Fitness",
            sourceLabel: "Workout"
          }];
        })()
      : [];

    const workoutMealItems = todayWorkout?.hasPlan && todayWorkout?.isScheduledForDay
      ? [
          (todayWorkout.plan?.preWorkoutMealTime || todayWorkout.plan?.preWorkoutMealText)
            ? {
                id: `${todayKey}-preworkout-meal`,
                time: timeOnlyLabel(todayWorkout.plan?.preWorkoutMealTime || null),
                duration: "--",
                title: todayWorkout.plan?.preWorkoutMealText
                  ? `Pre-workout meal: ${todayWorkout.plan.preWorkoutMealText}`
                  : "Pre-workout meal",
                type: "meal",
                aiReason: "From your workout plan PDF",
                domainLabel: "Nutrition",
                sourceLabel: "Plan Meal"
              }
            : null,
          (todayWorkout.plan?.postWorkoutMealTime || todayWorkout.plan?.postWorkoutMealText)
            ? {
                id: `${todayKey}-postworkout-meal`,
                time: timeOnlyLabel(todayWorkout.plan?.postWorkoutMealTime || null),
                duration: "--",
                title: todayWorkout.plan?.postWorkoutMealText
                  ? `Post-workout meal: ${todayWorkout.plan.postWorkoutMealText}`
                  : "Post-workout meal",
                type: "meal",
                aiReason: "From your workout plan PDF",
                domainLabel: "Nutrition",
                sourceLabel: "Plan Meal"
              }
            : null
        ].filter(Boolean)
      : [];

    const mergedBusy = busyIntervals
      .sort((a, b) => a.start - b.start)
      .reduce<Array<{ start: number; end: number }>>((acc, cur) => {
        const last = acc[acc.length - 1];
        if (!last || cur.start > last.end) {
          acc.push({ ...cur });
        } else {
          last.end = Math.max(last.end, cur.end);
        }
        return acc;
      }, []);

    const dayStart = 7 * 60;
    const dayEnd = 22 * 60;
    const freeSlots: Array<{ start: number; end: number }> = [];
    let cursor = dayStart;
    for (const slot of mergedBusy) {
      if (slot.start > cursor) {
        freeSlots.push({ start: cursor, end: slot.start });
      }
      cursor = Math.max(cursor, slot.end);
    }
    if (cursor < dayEnd) {
      freeSlots.push({ start: cursor, end: dayEnd });
    }

    const urgentDeadlineItems = dedupeDeadlineItems(analytics?.deadlineIntelligence?.items || [])
      .filter((item) => item.status === "at-risk" || item.status === "needs-attention")
      .sort((a, b) => Number(a.daysLeft || 999) - Number(b.daysLeft || 999))
      .slice(0, 3);

    const allocateStudySlot = (requestedDuration: number, preferred: number) => {
      let chosenIndex = -1;
      let chosenStart = -1;
      let chosenDuration = requestedDuration;

      for (let i = 0; i < freeSlots.length; i += 1) {
        const gap = freeSlots[i];
        if (gap.end - gap.start < requestedDuration) continue;
        if (preferred >= gap.start && preferred + requestedDuration <= gap.end) {
          chosenIndex = i;
          chosenStart = preferred;
          break;
        }
        if (chosenIndex === -1) {
          chosenIndex = i;
          chosenStart = gap.start;
        }
      }

      if (chosenIndex === -1) {
        const fallback = freeSlots
          .map((slot, idx) => ({ idx, slot, size: slot.end - slot.start }))
          .filter((entry) => entry.size >= 30)
          .sort((a, b) => b.size - a.size)[0];
        if (!fallback) return null;
        chosenIndex = fallback.idx;
        chosenStart = fallback.slot.start;
        chosenDuration = Math.min(requestedDuration, fallback.size);
      }

      const gap = freeSlots[chosenIndex];
      const start = Math.max(gap.start, chosenStart);
      const end = start + chosenDuration;
      if (end > gap.end) return null;

      freeSlots.splice(chosenIndex, 1);
      if (gap.start < start) freeSlots.splice(chosenIndex, 0, { start: gap.start, end: start });
      if (end < gap.end) freeSlots.splice(chosenIndex + (gap.start < start ? 1 : 0), 0, { start: end, end: gap.end });
      return { start, end, duration: chosenDuration };
    };

    const deadlineStudyItems: ScheduleItem[] = [];
    for (const item of urgentDeadlineItems) {
      const baselineMinutes = Math.max(25, Math.min(210, Math.round(Number(item.studyMinutesPerDay || 45))));
      const totalMinutes = Math.max(25, Math.min(210, Math.round(baselineMinutes * personalCompression * attendanceRecoveryBoost)));
      const baselineSessions = Math.max(1, Math.min(4, Math.round(Number(item.sessionCount || 1))));
      let sessions = Math.max(1, Math.min(4, Math.round(baselineSessions * personalCompression)));
      if (attendanceRisk >= 70 && item.status === "at-risk") sessions = Math.max(sessions, 2);
      if (attendanceRisk >= 60 && item.status === "needs-attention") sessions = Math.max(sessions, 1);
      const eachSession = Math.max(25, Math.min(90, Math.round(Number(item.sessionMinutes || Math.round(totalMinutes / sessions)))));
      const preferred = parseStartMinutes(String(item.recommendedWindow || ""));
      const providerLabel = providerLabelFromValue(item.provider, item.title, item.source || null);
      const assessmentLabel = item.assessmentType || inferAssessmentType(item.title);
      const dueLabel = humanDueLabel(Number(item.daysLeft || 0));

      for (let sessionIdx = 0; sessionIdx < sessions; sessionIdx += 1) {
        const preferredForSession = preferred + (sessionIdx * (eachSession + 25));
        const slot = allocateStudySlot(eachSession, preferredForSession);
        if (!slot) break;
        deadlineStudyItems.push({
          id: `${todayKey}-deadline-study-${item.id}-${sessionIdx + 1}`,
          time: `${minutesToLabel(slot.start)} - ${minutesToLabel(slot.end)}`,
          duration: `${slot.duration} min`,
          title: `${sessions > 1 ? `Study Block ${sessionIdx + 1}/${sessions}: ` : "Study Block: "}${normalizeDeadlineTitle(item.title)}`,
          type: "assignment",
          aiReason: `${dueLabel}. ${providerLabel}${assessmentLabel ? ` • ${assessmentLabel}` : ""}${item.focusMode ? ` • ${item.focusMode}` : ""}${personalLoadScore >= 2 ? " • adjusted for personal commitments" : ""}${attendanceRisk >= 60 ? " • attendance recovery priority" : ""}.`,
          domainLabel: "Academic",
          sourceLabel: providerLabel,
          assessmentLabel
        });
      }
    }

    const personalCommitmentItems: ScheduleItem[] = todayPersonalEvents.slice(0, 2).map((event, idx) => ({
      id: `${todayKey}-personal-${event.event_id || idx}`,
      time: "Anytime",
      duration: "--",
      title: event.title,
      type: "buffer",
      aiReason: isPersonalGoalTitle(event.title) ? "Personal goal from calendar" : "Personal commitment from calendar",
      domainLabel: "Personal",
      sourceLabel: "Calendar"
    }));

    const merged = [
      ...classItems,
      ...workoutItems,
      ...(workoutMealItems as ScheduleItem[]),
      ...personalCommitmentItems,
      ...deadlineStudyItems
    ] as ScheduleItem[];

    return merged.sort((a, b) => parseStartMinutes(a.time) - parseStartMinutes(b.time));
  }, [analytics?.deadlineIntelligence, events, timetableRows, today, todayWorkout]);

  const deadlines = useMemo(() => {
    const aiDeadlines = dedupeDeadlineItems(analytics?.deadlineIntelligence?.items || []).map((item) => ({
      id: item.id,
      subject: normalizeDeadlineTitle(item.title),
      dueDate: humanDueLabel(Number(item.daysLeft || 0)),
      dueDateIso: String(item.dueDateIso || "").slice(0, 10) || null,
      optimalStart: item.optimalStart,
      recommendedWindow: item.recommendedWindow,
      status: item.status,
      progress: 0,
      concisePlan: `Focus ~${item.studyMinutesPerDay} min/day${item.sessionCount && item.sessionMinutes ? ` (${item.sessionCount} x ${item.sessionMinutes} min)` : ""}`,
      aiDetail: `${item.microcopy}${item.focusMode ? ` Focus mode: ${item.focusMode}.` : ""}`,
      sourceLabel: providerLabelFromValue(item.provider, item.title, item.source || null),
      assessmentLabel: item.assessmentType || inferAssessmentType(item.title)
    }));

    if (aiDeadlines.length > 0) {
      return aiDeadlines.slice(0, 4);
    }

    const now = new Date();
    const upcoming = events
      .filter((e) => e.event_type === "academic" && isLikelyAcademicTitle(e.title))
      .map((e) => ({ ...e, due: new Date(`${String(e.event_date).slice(0, 10)}T00:00:00`) }))
      .filter((e) => e.due.getTime() >= new Date(now.toDateString()).getTime())
      .sort((a, b) => a.due.getTime() - b.due.getTime())
      .slice(0, 3);

    return upcoming.map((e) => {
      const days = Math.round((e.due.getTime() - new Date(now.toDateString()).getTime()) / (1000 * 60 * 60 * 24));
      const status = days <= 1 ? "at-risk" : days <= 3 ? "needs-attention" : "safe";
      return {
        id: e.event_id,
        subject: normalizeDeadlineTitle(e.title),
        dueDate: humanDueLabel(days),
        dueDateIso: String(e.event_date || "").slice(0, 10) || null,
        optimalStart: days <= 1 ? "Now" : "Today",
        recommendedWindow: null,
        status,
        progress: 0,
        concisePlan: status === "at-risk" ? "Start immediately to avoid overload" : "Start today to keep buffer",
        aiDetail: null,
        sourceLabel: inferAcademicSource(e.title, "calendar"),
        assessmentLabel: inferAssessmentType(e.title)
      };
    });
  }, [analytics, events]);

  const syncDeadlinesToGoogleTasks = async () => {
    if (deadlines.length === 0) {
      setTaskSyncMessage("No deadline items to sync.");
      return;
    }

    try {
      setError("");
      setTaskSyncMessage(null);
      setTaskSyncBusy(true);

      const items = deadlines.map((item) => ({
        id: item.id,
        title: item.subject,
        dueDateIso: item.dueDateIso,
        sourceLabel: item.sourceLabel,
        assessmentLabel: item.assessmentLabel,
        optimalStart: item.optimalStart,
        recommendedWindow: item.recommendedWindow,
        concisePlan: item.concisePlan,
        aiDetail: item.aiDetail
      }));

      const payload = await apiRequest<{ created: number; skipped: number }>("/api/integrations/tasks/sync-planner", {
        method: "POST",
        body: { items }
      });
      const created = Number(payload?.created || 0);
      const skipped = Number(payload?.skipped || 0);
      setTaskSyncMessage(`Synced ${created} task${created === 1 ? "" : "s"}${skipped > 0 ? ` (${skipped} skipped)` : ""}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync Google Tasks");
    } finally {
      setTaskSyncBusy(false);
    }
  };

  const exportDeadlinesToGoogleDoc = async () => {
    if (deadlines.length === 0) {
      setDocExportMessage("No deadline items to export.");
      return;
    }

    try {
      setError("");
      setDocExportMessage(null);
      setDocExportBusy(true);

      const items = deadlines.map((item) => ({
        id: item.id,
        title: item.subject,
        dueDateIso: item.dueDateIso,
        sourceLabel: item.sourceLabel,
        assessmentLabel: item.assessmentLabel,
        status: item.status,
        optimalStart: item.optimalStart,
        recommendedWindow: item.recommendedWindow,
        concisePlan: item.concisePlan,
        aiDetail: item.aiDetail
      }));

      const payload = await apiRequest<{ url: string | null; documentId: string | null; title: string | null }>("/api/integrations/docs/planner-export", {
        method: "POST",
        body: {
          title: `GAK Planner Export ${new Date().toISOString().slice(0, 10)}`,
          items
        }
      });

      if (payload?.url) {
        window.open(payload.url, "_blank", "noopener,noreferrer");
      }
      setDocExportMessage(payload?.title ? `Exported to Google Doc: ${payload.title}` : "Exported to Google Doc.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export Google Doc");
    } finally {
      setDocExportBusy(false);
    }
  };

  if (!user) return null;

  return (
    <SwipeContainer>
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/80 border-b border-border/50">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gak/10">
                  <Calendar className="h-4 w-4 text-gak" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-foreground">Planner</h1>
                  <p className="text-xs text-muted-foreground">
                    {today.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                  </p>
                </div>
              </div>
              <button onClick={() => setMenuOpen(true)} className="p-2 rounded-full hover:bg-secondary transition-colors">
                <Menu className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <div className="flex gap-2">
              <Button
                variant={viewMode === "calendar" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("calendar")}
                className={`flex-1 rounded-full text-xs ${viewMode === "calendar" ? "bg-gak hover:bg-gak/90" : ""}`}
              >
                <Calendar className="mr-1.5 h-3.5 w-3.5" />
                Calendar
              </Button>
              <Button
                variant={viewMode === "ai" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("ai")}
                className={`flex-1 rounded-full text-xs ${viewMode === "ai" ? "bg-gak hover:bg-gak/90" : ""}`}
              >
                <Zap className="mr-1.5 h-3.5 w-3.5" />
                Daily Plan
              </Button>
            </div>
          </div>
        </header>

        <main className="px-4 py-4 space-y-4">
          {loading && <p className="text-sm text-muted-foreground">Loading planner...</p>}
          {error && <p className="text-sm text-red-500">{error}</p>}

          <AnimatePresence mode="wait">
            {viewMode === "ai" ? (
              <motion.div
                key="ai"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                {analytics?.deadlineIntelligence?.sensitivityLayer?.mode === "cycle-aware" && (
                  <section className="glass-card p-3 border-l-4 border-l-warning">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Cycle Support Layer</p>
                    <p className="text-sm text-foreground mt-1">
                      {analytics.deadlineIntelligence.sensitivityLayer.note || "Cycle-aware pacing enabled."}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {analytics.deadlineIntelligence.sensitivityLayer.phase
                        ? `Phase: ${analytics.deadlineIntelligence.sensitivityLayer.phase}`
                        : "Phase: --"}
                      {analytics.deadlineIntelligence.sensitivityLayer.cycleDay
                        ? ` • Day ${analytics.deadlineIntelligence.sensitivityLayer.cycleDay}`
                        : ""}
                    </p>
                  </section>
                )}
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="h-4 w-4 text-gak" />
                    <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Today's Plan</h2>
                  </div>
                  <div className="space-y-2">
                    {aiSchedule.length === 0 ? (
                      <div className="glass-card p-4 text-sm text-muted-foreground">No calendar items for today yet.</div>
                    ) : (
                      aiSchedule.map((item, index) => {
                        const styles = getTypeStyles(item.type);
                        const Icon = styles.icon;

                        return (
                          <motion.div
                            key={item.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                            className={`glass-card p-3 border-l-4 ${styles.border}`}
                          >
                            <div className="flex items-start gap-3">
                              <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${styles.bg}`}>
                                <Icon className={`h-4 w-4 ${styles.color}`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-1.5">
                                  <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                                    {item.domainLabel}
                                  </span>
                                  <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                                    {item.sourceLabel}
                                  </span>
                                  {item.assessmentLabel ? (
                                    <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                                      {item.assessmentLabel}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                  <h3 className="font-medium text-foreground truncate">{item.title}</h3>
                                  <span className="text-xs text-muted-foreground whitespace-nowrap">{item.time}</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">{item.aiReason}</p>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })
                    )}
                  </div>
                </section>
              </motion.div>
            ) : (
              <motion.div
                key="calendar"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <section className="glass-card p-4">
                  <div className="flex items-center justify-between mb-4">
                    <button onClick={prevMonth} className="p-2 rounded-full hover:bg-secondary transition-colors" type="button">
                      <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                    </button>
                    <h2 className="text-base font-semibold text-foreground">
                      {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                    </h2>
                    <button onClick={nextMonth} className="p-2 rounded-full hover:bg-secondary transition-colors" type="button">
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>

                  <div className="grid grid-cols-7 gap-1 mb-2">
                    {weekDays.map((day) => (
                      <div key={day} className="text-center text-xs text-muted-foreground font-medium py-1">
                        {day}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: startingDay }).map((_, idx) => (
                      <div key={`empty-${idx}`} className="aspect-square w-full" />
                    ))}
                    {Array.from({ length: daysInMonth }, (_, idx) => idx + 1).map((day) => {
                      const key = formatDateKey(currentMonth.getFullYear(), currentMonth.getMonth(), day);
                      const goals = calendarGoals.get(key) || [];
                      const hasGoals = goals.length > 0;

                      return (
                        <button
                          key={day}
                          onClick={() => handleDateClick(day)}
                          className={`aspect-square w-full rounded-lg relative transition-colors flex items-center justify-center ${
                            isToday(day) ? "bg-gak/20 border border-gak/30" : "hover:bg-secondary/50"
                          }`}
                          type="button"
                        >
                          <span className={`text-sm ${isToday(day) ? "text-gak font-semibold" : "text-foreground"}`}>{day}</span>
                          {hasGoals && (
                            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                              {goals.slice(0, 3).map((g, i) => (
                                <div key={`${key}-${i}`} className={`w-1.5 h-1.5 rounded-full ${getEventTypeColor(g.type)}`} />
                              ))}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {[
                      { type: "gyaan", label: "Academic" },
                      { type: "karma", label: "Fitness" },
                      { type: "ahara", label: "Nutrition" },
                      { type: "personal", label: "Personal" }
                    ].map((item) => (
                      <div key={item.type} className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${getEventTypeColor(item.type)}`} />
                        {item.label}
                      </div>
                    ))}
                  </div>
                </section>
              </motion.div>
            )}
          </AnimatePresence>

          <section>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Deadlines</h2>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void syncDeadlinesToGoogleTasks()}
                  disabled={taskSyncBusy || deadlines.length === 0}
                  className="text-[11px] h-7 px-2"
                >
                  {taskSyncBusy ? "Syncing..." : "Sync to Tasks"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void exportDeadlinesToGoogleDoc()}
                  disabled={docExportBusy || deadlines.length === 0}
                  className="text-[11px] h-7 px-2"
                >
                  {docExportBusy ? "Exporting..." : "Export to Docs"}
                </Button>
                <button
                  type="button"
                  onClick={() => setShowAiDetails((value) => !value)}
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showAiDetails ? "Hide AI details" : "Show AI details"}
                </button>
              </div>
            </div>
            {taskSyncMessage && <p className="text-xs text-safe mb-2">{taskSyncMessage}</p>}
            {docExportMessage && <p className="text-xs text-safe mb-2">{docExportMessage}</p>}
            <div className="space-y-2">
              {deadlines.length === 0 ? (
                <div className="glass-card p-4 text-sm text-muted-foreground">No upcoming academic deadlines in calendar.</div>
              ) : (
                deadlines.map((deadline, idx) => {
                  const styles = getStatusStyles(deadline.status);
                  const Icon = styles.icon;

                  return (
                    <motion.div
                      key={deadline.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.05 + idx * 0.05 }}
                      className="glass-card p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="mb-1.5 flex items-center gap-1.5">
                            <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                              {deadline.sourceLabel}
                            </span>
                            {deadline.assessmentLabel ? (
                              <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                                {deadline.assessmentLabel}
                              </span>
                            ) : null}
                          </div>
                          <p className="text-sm font-medium text-foreground truncate">{deadline.subject}</p>
                          <p className="text-xs text-muted-foreground mt-1">{deadline.concisePlan}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Suggested start: {deadline.optimalStart}
                            {deadline.recommendedWindow ? ` • ${deadline.recommendedWindow}` : ""}
                            {deadline.dueDateIso ? ` • Due ${formatIsoDate(deadline.dueDateIso)}` : ""}
                          </p>
                          {showAiDetails && deadline.aiDetail ? (
                            <p className="text-xs text-muted-foreground/90 mt-1">{deadline.aiDetail}</p>
                          ) : null}
                        </div>
                        <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${styles.bg} ${styles.color}`}>
                          <Icon className="h-3.5 w-3.5" />
                          {deadline.dueDate}
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </section>
        </main>

        <DayGoalsPopup isOpen={popupOpen} onClose={() => setPopupOpen(false)} date={selectedDate} goals={getGoalsForDate(selectedDate)} />
        <ProfileMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
        <BottomNav />
      </div>
    </SwipeContainer>
  );
};

export default Planner;
