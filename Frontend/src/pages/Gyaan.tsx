import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  BookOpen,
  ArrowLeft,
  TrendingUp,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Calendar,
  GraduationCap,
  RefreshCw,
  Menu,
} from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { TimetableView, type TimetableClassItem } from "@/components/TimetableView";
import { ProfileMenu } from "@/components/ProfileMenu";
import { AttendancePrediction } from "@/components/AttendancePrediction";
import { MarksView, type MarksSubjectRow } from "@/components/MarksView";
import { Button } from "@/components/ui/button";
import { SwipeContainer } from "@/components/SwipeContainer";
import { apiRequest, getSessionUser } from "@/lib/api";

type ViewMode = "attendance" | "timetable" | "marks";

type AttendanceRow = {
  subject_id: string;
  subject_name: string;
  total_classes: number;
  attended_classes: number;
  attendance_percentage: string;
};

type TimetableRow = {
  timetable_entry_id: string;
  day_order: number | null;
  day_label?: string | null;
  start_time: string | null;
  end_time: string | null;
  subject_name: string;
  faculty_name?: string;
  room_number?: string;
  building_name?: string;
};

type MarksPerfRow = {
  subject_id: string;
  subject_name: string;
  average_percentage: string;
  components_count: number;
  section_rank?: number | null;
  class_size?: number | null;
  top_percent?: number | null;
};

type MarksDetailRow = {
  marks_id: string;
  subject_id: string;
  subject_name: string;
  component_type: string;
  score: number;
  max_score: number;
  recorded_at: string;
};

type AcademiaStatus = {
  connected: boolean;
  collegeEmail: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  syncState?: "idle" | "syncing" | "success" | "requires_relogin" | "captcha_required" | "failed" | string;
};

type AcademicDayOrder = {
  date: string;
  dayOrder: number | null;
  source: string;
  tomorrow?: {
    date: string;
    dayOrder: number | null;
    isHoliday: boolean;
    holidayDescription: string | null;
    source: string;
  } | null;
};

type AcademicSnapshot = {
  attendanceRows: AttendanceRow[];
  timetableRows: TimetableRow[];
  marksPerfRows: MarksPerfRow[];
  marksDetailRows: MarksDetailRow[];
  academiaStatus: AcademiaStatus | null;
  academicDayOrder: AcademicDayOrder | null;
  fetchedAt: string;
};

type LoadOptions = {
  showLoading?: boolean;
  triggerBackgroundSync?: boolean;
  silent?: boolean;
  fallbackSnapshot?: AcademicSnapshot | null;
};

function getGyaanCacheKey(userId: string) {
  return `gyaan_cache_v3_${userId}`;
}

function buildSnapshotSignature(snapshot: Pick<AcademicSnapshot, "attendanceRows" | "marksPerfRows" | "marksDetailRows" | "academicDayOrder">): string {
  return JSON.stringify({
    attendanceRows: snapshot.attendanceRows,
    marksPerfRows: snapshot.marksPerfRows,
    marksDetailRows: snapshot.marksDetailRows,
    academicDayOrder: snapshot.academicDayOrder
  });
}

function shouldBackfillReportsData(snapshot: Pick<AcademicSnapshot, "timetableRows" | "academicDayOrder">): boolean {
  const hasTimetableRows = Array.isArray(snapshot.timetableRows) && snapshot.timetableRows.length > 0;
  const dayOrderValue = Number(snapshot.academicDayOrder?.dayOrder);
  const hasAcademicCalendarDayOrder = snapshot.academicDayOrder?.source === "academic_calendar"
    && Number.isFinite(dayOrderValue)
    && dayOrderValue >= 1
    && dayOrderValue <= 7;
  return !hasTimetableRows || !hasAcademicCalendarDayOrder;
}

function attendanceStatus(value: number): "safe" | "warning" | "critical" {
  if (value >= 75) return "safe";
  if (value >= 65) return "warning";
  return "critical";
}

function getStatusColor(status: string) {
  switch (status) {
    case "safe":
      return "text-safe";
    case "warning":
      return "text-warning";
    case "critical":
      return "text-critical";
    default:
      return "text-muted-foreground";
  }
}

function getProgressColor(status: string) {
  switch (status) {
    case "safe":
      return "bg-safe";
    case "warning":
      return "bg-warning";
    case "critical":
      return "bg-critical";
    default:
      return "bg-primary";
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case "safe":
      return <CheckCircle className="h-5 w-5 text-safe" />;
    case "warning":
      return <AlertTriangle className="h-5 w-5 text-warning" />;
    case "critical":
      return <XCircle className="h-5 w-5 text-critical" />;
    default:
      return null;
  }
}

function classesNeededFor75(attended: number, conducted: number): number {
  const target = 0.75;
  const needed = (target * conducted - attended) / (1 - target);
  return Math.max(0, Math.ceil(needed));
}

function classesCanSkipAt75(attended: number, conducted: number): number {
  const target = 0.75;
  const allowed = (attended / target) - conducted;
  return Math.max(0, Math.floor(allowed));
}

function getSemesterProgressRatio(referenceDate = new Date()): number {
  const now = new Date(referenceDate);
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-based
  const isEvenSemester = month <= 5;
  const start = isEvenSemester ? new Date(year, 0, 1) : new Date(year, 6, 1);
  const end = isEvenSemester ? new Date(year, 4, 31, 23, 59, 59, 999) : new Date(year, 10, 30, 23, 59, 59, 999);
  const total = Math.max(1, end.getTime() - start.getTime());
  const elapsed = Math.max(0, Math.min(total, now.getTime() - start.getTime()));
  return Math.max(0.2, Math.min(1, elapsed / total));
}

function estimateSemesterTotalClasses(conducted: number): number {
  const safeConducted = Math.max(0, Math.round(Number(conducted || 0)));
  if (!safeConducted) return 0;
  const ratio = getSemesterProgressRatio(new Date());
  return Math.max(safeConducted, Math.round(safeConducted / ratio));
}

function normalizeMarksSubjectLabel(name: string): string {
  const raw = String(name || "").trim();
  if (!raw) return raw;
  const withoutRegular = raw.replace(/\bregular\b/gi, " ").replace(/\s+/g, " ").trim();
  const strippedCode = withoutRegular.replace(/^[0-9]{2}[A-Z]{2,}\d+[A-Z]?\s*/i, "").trim();
  return strippedCode.length >= 3 ? strippedCode : withoutRegular || raw;
}

function isLikelyCourseCodeLabel(name: string): boolean {
  const text = String(name || "").trim().toUpperCase();
  if (!text) return false;
  const compact = text.replace(/\bREGULAR\b/g, "").replace(/\s+/g, " ").trim();
  return /^[0-9]{2}[A-Z]{2,}\d+[A-Z]?(?:\s+[A-Z0-9]+)*$/.test(compact);
}

function normalizeSubjectKey(name: string): string {
  return String(name || "")
    .toLowerCase()
    .replace(/\b(regular|theory|dr|prof|mr|mrs|ms)\b/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatMonthDay(dateIso?: string | null): string | null {
  const raw = String(dateIso || "").trim();
  if (!raw) return null;
  const parsed = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(parsed);
}

function isLikelyLabToken(value: string | null | undefined): boolean {
  return /\blab|practical\b/i.test(String(value || ""));
}

function isSlotLikeDayLabel(dayLabel?: string | null): boolean {
  const text = String(dayLabel || "").trim().toUpperCase();
  if (!text) return false;
  return /^([A-G][0-9]*|LAB[0-9]*)$/.test(text);
}

function inferDayOrderFromDayLabel(dayLabel?: string | null): number | null {
  const text = String(dayLabel || "").trim().toLowerCase();
  if (!text) return null;

  const dayOrderMatch = text.match(/day\s*[- ]?order\s*(\d+)/i) || text.match(/\bday\s*(\d+)\b/i);
  if (dayOrderMatch) {
    const day = Number(dayOrderMatch[1]);
    if (Number.isFinite(day) && day >= 1 && day <= 7) return day;
  }

  if (/monday|mon\b/.test(text)) return 1;
  if (/tuesday|tue\b/.test(text)) return 2;
  if (/wednesday|wed\b/.test(text)) return 3;
  if (/thursday|thu\b/.test(text)) return 4;
  if (/friday|fri\b/.test(text)) return 5;
  if (/saturday|sat\b/.test(text)) return 6;
  if (/sunday|sun\b/.test(text)) return 7;

  return null;
}

function resolveTimetableDayOrder(row: TimetableRow, subjectDayHint = new Map<string, number>()): number | null {
  const numericDayOrder = Number(row.day_order);
  const inferredFromLabel = inferDayOrderFromDayLabel(row.day_label);
  if (inferredFromLabel !== null && inferredFromLabel >= 1 && inferredFromLabel <= 7) {
    return inferredFromLabel;
  }
  if (Number.isFinite(numericDayOrder) && numericDayOrder >= 1 && numericDayOrder <= 7) {
    if (isSlotLikeDayLabel(row.day_label)) {
      return null;
    }
    return numericDayOrder;
  }
  const hinted = subjectDayHint.get(normalizeSubjectKey(row.subject_name));
  if (Number.isFinite(hinted) && hinted >= 1 && hinted <= 7) {
    return hinted;
  }
  return null;
}

function requiresAcademiaRelogin(message?: string | null): boolean {
  const text = String(message || "").toLowerCase();
  if (!text) return false;
  return (
    text.includes("relogin")
    || text.includes("re-login")
    || text.includes("manual action")
    || text.includes("mfa")
    || text.includes("otp")
    || text.includes("captcha")
    || text.includes("one-time login")
    || text.includes("creator upgrade prompt")
    || text.includes("session limit")
  );
}

function normalizeAcademiaErrorMessage(status: AcademiaStatus | null, hasData: boolean): string | null {
  const raw = String(status?.lastError || "").trim();
  if (!raw) return null;
  const state = String(status?.syncState || "").toLowerCase();
  if (state === "success" || state === "syncing" || state === "idle") {
    return null;
  }
  if (state === "captcha_required" || /\bcaptcha|mfa|otp|manual action\b/i.test(raw)) {
    return hasData
      ? "Academia needs manual verification to refresh. Showing last synced records."
      : "Academia needs manual verification before first sync.";
  }
  if (state === "requires_relogin" || /\brelogin|re-login|session|login required|sign in\b/i.test(raw)) {
    return hasData
      ? "Academia session expired. Showing last synced records; reconnect to refresh."
      : "Academia session expired. Reconnect and sync again.";
  }
  return hasData
    ? "Latest Academia sync failed. Showing last synced records."
    : "Academia sync failed. Please retry.";
}

function buildMarksSubjects(perfRows: MarksPerfRow[], detailRows: MarksDetailRow[]): MarksSubjectRow[] {
  const bySubject = new Map<
    string,
    {
      subjectName: string;
      avgPct: number;
      components: MarksSubjectRow["components"];
      topPercent: number | null;
      sectionRank: number | null;
      classSize: number | null;
    }
  >();

  for (const p of perfRows) {
    bySubject.set(p.subject_id, {
      subjectName: normalizeMarksSubjectLabel(p.subject_name),
      avgPct: Number(p.average_percentage || 0),
      components: [],
      topPercent: p.top_percent === undefined || p.top_percent === null ? null : Number(p.top_percent),
      sectionRank: p.section_rank === undefined || p.section_rank === null ? null : Number(p.section_rank),
      classSize: p.class_size === undefined || p.class_size === null ? null : Number(p.class_size)
    });
  }

  for (const d of detailRows) {
    const key = d.subject_id;
    const detailLabel = normalizeMarksSubjectLabel(d.subject_name);
    const current =
      bySubject.get(key)
      || { subjectName: normalizeMarksSubjectLabel(d.subject_name), avgPct: 0, components: [], topPercent: null, sectionRank: null, classSize: null };
    if (isLikelyCourseCodeLabel(current.subjectName) && detailLabel && !isLikelyCourseCodeLabel(detailLabel)) {
      current.subjectName = detailLabel;
    }
    current.components.push({
      id: d.marks_id,
      name: d.component_type,
      obtained: Number(Number(d.score).toFixed(2)),
      total: Number(Number(d.max_score).toFixed(2))
    });
    bySubject.set(key, current);
  }

  return Array.from(bySubject.entries()).map(([id, value]) => {
    const totalObtained = value.components.reduce((sum, c) => sum + Number(c.obtained || 0), 0);
    const totalMax = value.components.reduce((sum, c) => sum + Number(c.total || 0), 0);
    const weightedAverage = totalMax > 0 ? Number(((totalObtained / totalMax) * 100).toFixed(2)) : null;
    return {
      id,
      subjectName: value.subjectName,
      averagePercentage: weightedAverage !== null ? weightedAverage : value.avgPct,
      components: value.components,
      topPercent: value.topPercent,
      sectionRank: value.sectionRank,
      classSize: value.classSize
    };
  });
}

const Gyaan = () => {
  const navigate = useNavigate();
  const user = getSessionUser();

  const [viewMode, setViewMode] = useState<ViewMode>("attendance");
  const [menuOpen, setMenuOpen] = useState(false);
  const [expandedMark, setExpandedMark] = useState<string | null>(null);
  const [predictionOpen, setPredictionOpen] = useState(false);
  const [manualDayOrderSelection, setManualDayOrderSelection] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncingAttendance, setSyncingAttendance] = useState(false);
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([]);
  const [timetableRows, setTimetableRows] = useState<TimetableRow[]>([]);
  const [marksPerfRows, setMarksPerfRows] = useState<MarksPerfRow[]>([]);
  const [marksDetailRows, setMarksDetailRows] = useState<MarksDetailRow[]>([]);

  const [currentDayOrder, setCurrentDayOrder] = useState(1);
  const syncInFlightRef = useRef<Promise<void> | null>(null);
  const reportsSyncInFlightRef = useRef<Promise<void> | null>(null);
  const reportsSyncAttemptedRef = useRef(false);
  const reloginRecoveryInFlightRef = useRef(false);
  const reloginFallbackPromptedRef = useRef(false);

  const [academiaStatus, setAcademiaStatus] = useState<AcademiaStatus | null>(null);
  const [academicDayOrder, setAcademicDayOrder] = useState<AcademicDayOrder | null>(null);

  const applySnapshot = (snapshot: AcademicSnapshot) => {
    setAttendanceRows(snapshot.attendanceRows || []);
    setTimetableRows(snapshot.timetableRows || []);
    setMarksPerfRows(snapshot.marksPerfRows || []);
    setMarksDetailRows(snapshot.marksDetailRows || []);
    setAcademiaStatus(snapshot.academiaStatus || null);
    setAcademicDayOrder(snapshot.academicDayOrder || null);
  };

  const readCachedSnapshot = (): AcademicSnapshot | null => {
    if (!user) return null;
    try {
      const raw = window.localStorage.getItem(getGyaanCacheKey(user.userId));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return parsed as AcademicSnapshot;
    } catch {
      return null;
    }
  };

  const writeCachedSnapshot = (snapshot: AcademicSnapshot) => {
    if (!user) return;
    try {
      window.localStorage.setItem(getGyaanCacheKey(user.userId), JSON.stringify(snapshot));
    } catch {
      // Ignore storage failures (private mode/quota).
    }
  };

  const fetchSnapshot = async (): Promise<AcademicSnapshot> => {
    const [attendanceResp, timetableResp, perfResp, detailResp, acadStatusResp, dayOrderResp] = await Promise.all([
      apiRequest<{ bySubject: AttendanceRow[] }>(`/api/academic/attendance/summary/${user!.userId}`, { cache: "no-store", timeoutMs: 7000 }),
      apiRequest<TimetableRow[]>(`/api/academic/timetable/${user!.userId}`, { cache: "no-store", timeoutMs: 7000 }),
      apiRequest<MarksPerfRow[]>(`/api/academic/performance/${user!.userId}`, { cache: "no-store", timeoutMs: 7000 }),
      apiRequest<MarksDetailRow[]>(`/api/academic/marks/${user!.userId}`, { cache: "no-store", timeoutMs: 7000 }),
      apiRequest<AcademiaStatus>("/api/integrations/academia/status", { cache: "no-store", timeoutMs: 7000 }).catch(() => ({
        connected: false,
        collegeEmail: null,
        lastSyncedAt: null,
        lastError: null
      })),
      apiRequest<AcademicDayOrder>(`/api/academic/day-order/${user!.userId}`, { cache: "no-store", timeoutMs: 7000 }).catch(() => ({
        date: new Date().toISOString().slice(0, 10),
        dayOrder: null,
        source: "unavailable",
        tomorrow: null
      }))
    ]);

    return {
      attendanceRows: attendanceResp.bySubject || [],
      timetableRows: timetableResp || [],
      marksPerfRows: perfResp || [],
      marksDetailRows: detailResp || [],
      academiaStatus: acadStatusResp || null,
      academicDayOrder: dayOrderResp || null,
      fetchedAt: new Date().toISOString()
    };
  };

  const runReloginFallbackRecovery = async (reasonMessage: string) => {
    if (reloginRecoveryInFlightRef.current || reloginFallbackPromptedRef.current) {
      return;
    }
    reloginFallbackPromptedRef.current = true;

    reloginRecoveryInFlightRef.current = true;
    setSyncingAttendance(true);
    setError("Trying backend Academia recovery...");

    try {
      // Recovery path should stay backend-only (headless). Do not open Academia in frontend.
      await apiRequest("/api/integrations/academia/sync", { method: "POST", cache: "no-store", timeoutMs: 45000 });
      await apiRequest("/api/integrations/academia/sync-reports", { method: "POST", cache: "no-store", timeoutMs: 45000 }).catch(() => undefined);
      reloginFallbackPromptedRef.current = false;
      const snapshot = await fetchSnapshot();
      applySnapshot(snapshot);
      writeCachedSnapshot(snapshot);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to complete Academia one-time fallback login";
      const hasData = attendanceRows.length > 0 || timetableRows.length > 0 || marksPerfRows.length > 0 || marksDetailRows.length > 0;
      setError(normalizeAcademiaErrorMessage({ connected: false, collegeEmail: null, lastSyncedAt: null, lastError: message }, hasData) || message || reasonMessage || "Academia recovery needs manual action");
    } finally {
      reloginRecoveryInFlightRef.current = false;
      setSyncingAttendance(false);
    }
  };

  const startBackgroundReportsSync = (snapshotHint?: AcademicSnapshot) => {
    if (!user || reportsSyncInFlightRef.current || reportsSyncAttemptedRef.current) {
      return;
    }
    if (!snapshotHint?.academiaStatus?.connected) {
      return;
    }
    if (!shouldBackfillReportsData(snapshotHint)) {
      return;
    }

    reportsSyncAttemptedRef.current = true;
    const task = (async () => {
      try {
        await apiRequest("/api/integrations/academia/sync-reports", { method: "POST", cache: "no-store", timeoutMs: 30000 });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to sync Academia reports";
        if (requiresAcademiaRelogin(message)) {
          await runReloginFallbackRecovery(message);
        }
      }

      try {
        const snapshot = await fetchSnapshot();
        applySnapshot(snapshot);
        writeCachedSnapshot(snapshot);
      } catch {
        // keep last good UI snapshot
      }
    })()
      .finally(() => {
        reportsSyncInFlightRef.current = null;
      });

    reportsSyncInFlightRef.current = task;
  };

  const startBackgroundAttendanceSync = () => {
    if (!user || syncInFlightRef.current) {
      return;
    }
    setSyncingAttendance(true);
    const task = (async () => {
      try {
        await apiRequest("/api/integrations/academia/sync", { method: "POST", cache: "no-store", timeoutMs: 30000 });
        // Normal sync succeeded, so fallback prompt can be shown again if needed in a future failure.
        reloginFallbackPromptedRef.current = false;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to sync Academia";
        if (requiresAcademiaRelogin(message)) {
          await runReloginFallbackRecovery(message);
        }
      }

      try {
        const snapshot = await fetchSnapshot();
        const currentSignature = buildSnapshotSignature({
          attendanceRows,
          marksPerfRows,
          marksDetailRows,
          academicDayOrder
        });
        const incomingSignature = buildSnapshotSignature(snapshot);
        if (currentSignature !== incomingSignature) {
          applySnapshot(snapshot);
        }
        writeCachedSnapshot(snapshot);
        startBackgroundReportsSync(snapshot);
      } catch {
        // keep last good UI snapshot
      }
    })()
      .finally(() => {
        syncInFlightRef.current = null;
        setSyncingAttendance(false);
      });

    syncInFlightRef.current = task;
  };

  const load = async ({ showLoading = true, triggerBackgroundSync = false, silent = false, fallbackSnapshot = null }: LoadOptions = {}) => {
    if (!user) return;

    try {
      if (showLoading) {
        setLoading(true);
      }
      if (!silent) {
        setError("");
      }

      const snapshot = await fetchSnapshot();
      const currentSignature = buildSnapshotSignature({
        attendanceRows,
        marksPerfRows,
        marksDetailRows,
        academicDayOrder
      });
      const incomingSignature = buildSnapshotSignature(snapshot);
      if (!silent || currentSignature !== incomingSignature) {
        applySnapshot(snapshot);
      }
      writeCachedSnapshot(snapshot);
      startBackgroundReportsSync(snapshot);
      if (triggerBackgroundSync) {
        startBackgroundAttendanceSync();
      }
    } catch (err) {
      if (fallbackSnapshot) {
        applySnapshot(fallbackSnapshot);
      }
      if (!silent) {
        const hasData = Boolean(
          fallbackSnapshot
          || attendanceRows.length
          || timetableRows.length
          || marksPerfRows.length
          || marksDetailRows.length
        );
        const normalized = normalizeAcademiaErrorMessage(
          { connected: false, collegeEmail: null, lastSyncedAt: null, lastError: err instanceof Error ? err.message : "Failed to load academic data" },
          hasData
        );
        setError(normalized || (err instanceof Error ? err.message : "Failed to load academic data"));
      }
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!user) {
      navigate("/auth?mode=signin");
      return;
    }
    const cached = readCachedSnapshot();
    void load({ showLoading: true, silent: false, triggerBackgroundSync: true, fallbackSnapshot: cached });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const attendanceDisplayRows = attendanceRows;
  const timetableDisplayRows = timetableRows;
  const perfDisplayRows = marksPerfRows;
  const detailDisplayRows = marksDetailRows;
  const marksSubjects = buildMarksSubjects(perfDisplayRows, detailDisplayRows);
  const hasAcademicData = attendanceDisplayRows.length > 0 || timetableDisplayRows.length > 0 || perfDisplayRows.length > 0 || detailDisplayRows.length > 0;
  const academiaErrorBanner = normalizeAcademiaErrorMessage(academiaStatus, hasAcademicData);
  const visibleError = error && error !== academiaErrorBanner ? error : "";

  const overallAttendance = useMemo(() => {
    const totalClasses = attendanceDisplayRows.reduce((sum, row) => sum + Number(row.total_classes || 0), 0);
    const attendedClasses = attendanceDisplayRows.reduce((sum, row) => sum + Number(row.attended_classes || 0), 0);
    if (!totalClasses) return 0;
    return (attendedClasses / totalClasses) * 100;
  }, [attendanceDisplayRows]);

  const totalSubjects = attendanceDisplayRows.length;
  const subjectsBelow75 = attendanceDisplayRows.filter((s) => Number(s.attendance_percentage || 0) < 75).length;
  const totalConductedClasses = attendanceDisplayRows.reduce((sum, row) => sum + Number(row.total_classes || 0), 0);

  const subjectDayHint = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of timetableDisplayRows) {
      const fromLabel = inferDayOrderFromDayLabel(row.day_label);
      const numeric = Number(row.day_order);
      const resolved = fromLabel !== null && fromLabel >= 1 && fromLabel <= 7
        ? fromLabel
        : (Number.isFinite(numeric) && numeric >= 1 && numeric <= 7 && !isSlotLikeDayLabel(row.day_label) ? numeric : null);
      if (!Number.isFinite(resolved) || resolved < 1 || resolved > 7) continue;
      const key = normalizeSubjectKey(row.subject_name);
      if (!key || map.has(key)) continue;
      map.set(key, resolved);
    }
    return map;
  }, [timetableDisplayRows]);

  const availableDayOrders = [...new Set(
    timetableDisplayRows
      .map((row) => resolveTimetableDayOrder(row, subjectDayHint))
      .filter((value): value is number => Number.isFinite(value))
  )].sort((a, b) => a - b);
  const hasDayOrderSchedule = availableDayOrders.length > 0;
  const calendarDayOrder = Number(academicDayOrder?.dayOrder);
  const reportedCalendarDayOrder = Number.isFinite(calendarDayOrder) && calendarDayOrder >= 1 && calendarDayOrder <= 7
    ? calendarDayOrder
    : null;
  const preferredCalendarDayOrder = reportedCalendarDayOrder !== null && availableDayOrders.includes(reportedCalendarDayOrder)
    ? reportedCalendarDayOrder
    : null;
  const hasCalendarMappedDayOrder = academicDayOrder?.source === "academic_calendar" && reportedCalendarDayOrder !== null;
  const hasEstimatedDayOrder = academicDayOrder?.source === "weekday_estimate" && reportedCalendarDayOrder !== null;
  const fallbackDayOrder = availableDayOrders.includes(currentDayOrder)
    ? currentDayOrder
    : (preferredCalendarDayOrder ?? availableDayOrders[0] ?? 1);
  const selectedDayOrder = !manualDayOrderSelection && preferredCalendarDayOrder
    ? preferredCalendarDayOrder
    : fallbackDayOrder;
  const displayedCurrentDayOrder = reportedCalendarDayOrder ?? selectedDayOrder;

  const tomorrowStatusText = useMemo(() => {
    const tomorrow = academicDayOrder?.tomorrow;
    if (!tomorrow) {
      return "Tomorrow status unavailable";
    }
    const tomorrowDate = formatMonthDay(tomorrow.date);
    const prefix = tomorrowDate ? `Tomorrow (${tomorrowDate})` : "Tomorrow";
    if (tomorrow.isHoliday) {
      return tomorrow.holidayDescription
        ? `${prefix}: Holiday (${tomorrow.holidayDescription})`
        : `${prefix}: Holiday`;
    }
    const nextDayOrder = Number(tomorrow.dayOrder);
    if (Number.isFinite(nextDayOrder) && nextDayOrder >= 1 && nextDayOrder <= 7) {
      return `${prefix}: Day ${Math.round(nextDayOrder)}`;
    }
    return `${prefix}: Day order not published`;
  }, [academicDayOrder]);

  useEffect(() => {
    if (!manualDayOrderSelection && preferredCalendarDayOrder && preferredCalendarDayOrder !== currentDayOrder) {
      setCurrentDayOrder(preferredCalendarDayOrder);
    }
  }, [preferredCalendarDayOrder, currentDayOrder, manualDayOrderSelection]);

  const attendanceMap = new Map(attendanceDisplayRows.map((row) => [normalizeSubjectKey(row.subject_name), Number(row.attendance_percentage || 0)]));
  const attendanceVariant = useMemo(() => {
    const groups = new Map<string, AttendanceRow[]>();
    const labHintByKey = new Set<string>();
    for (const row of attendanceDisplayRows) {
      const key = normalizeSubjectKey(row.subject_name);
      const list = groups.get(key) || [];
      list.push(row);
      groups.set(key, list);
    }
    for (const row of timetableDisplayRows) {
      const key = normalizeSubjectKey(row.subject_name);
      if (!key) continue;
      if (isLikelyLabToken(row.day_label || null) || isLikelyLabToken(row.room_number || null) || isLikelyLabToken(row.subject_name)) {
        labHintByKey.add(key);
      }
    }

    const labelById = new Map<string, string>();
    const variantById = new Map<string, string>();
    const duplicateKeys = new Set<string>();
    for (const [key, rows] of groups.entries()) {
      if (rows.length <= 1) {
        labelById.set(rows[0].subject_id, rows[0].subject_name);
        variantById.set(rows[0].subject_id, key);
        continue;
      }
      duplicateKeys.add(key);
      const sorted = [...rows].sort((a, b) => Number(a.total_classes || 0) - Number(b.total_classes || 0));
      const labIndex = labHintByKey.has(key) ? 0 : -1;
      sorted.forEach((row, idx) => {
        const isLab = idx === labIndex;
        const suffix = isLab ? "Lab" : idx === 0 ? "Theory" : `Group ${idx + 1}`;
        labelById.set(row.subject_id, `${row.subject_name} (${suffix})`);
        variantById.set(row.subject_id, `${key}|${isLab ? "lab" : "theory"}`);
      });
    }
    return { labelById, variantById, duplicateKeys };
  }, [attendanceDisplayRows, timetableDisplayRows]);

  const attendanceMetaBySubject = useMemo(() => {
    const map = new Map<string, { facultyName: string | null; roomLabel: string | null; startTime: string | null; endTime: string | null }>();
    for (const row of timetableDisplayRows) {
      const key = normalizeSubjectKey(row.subject_name);
      if (!key) continue;
      const existing = map.get(key);
      if (existing && existing.facultyName && existing.roomLabel && existing.startTime && existing.endTime) {
        continue;
      }
      map.set(key, {
        facultyName: row.faculty_name || existing?.facultyName || null,
        roomLabel: row.room_number || existing?.roomLabel || null,
        startTime: row.start_time || existing?.startTime || null,
        endTime: row.end_time || existing?.endTime || null
      });
    }
    return map;
  }, [timetableDisplayRows]);

  const timetableItems: TimetableClassItem[] = timetableDisplayRows
    .map((row) => {
      const numericDayOrder = resolveTimetableDayOrder(row, subjectDayHint);
      if (!Number.isFinite(numericDayOrder) || numericDayOrder < 1 || numericDayOrder > 7) {
        return null;
      }
      const percentage = attendanceMap.get(normalizeSubjectKey(row.subject_name)) ?? 100;
      const priority = percentage < 65 ? "must-attend" : percentage < 75 ? "attend-if-possible" : "safe-to-skip";

      return {
        id: row.timetable_entry_id,
        dayOrder: numericDayOrder,
        dayLabel: row.day_label || `Day ${numericDayOrder}`,
        startTime: row.start_time,
        endTime: row.end_time,
        subjectName: row.subject_name,
        roomLabel: row.room_number || null,
        facultyName: row.faculty_name || null,
        priority
      };
    })
    .filter((row): row is TimetableClassItem => row !== null);

  const unscheduledTimetableRows = timetableDisplayRows
    .map((row) => {
      const resolved = resolveTimetableDayOrder(row, subjectDayHint);
      if (Number.isFinite(resolved) && resolved !== null) {
        return null;
      }
      return {
        id: row.timetable_entry_id,
        subjectName: row.subject_name,
        startTime: row.start_time,
        endTime: row.end_time,
        facultyName: row.faculty_name || null,
        roomLabel: row.room_number || null
      };
    })
    .filter((row): row is { id: string; subjectName: string; startTime: string | null; endTime: string | null; facultyName: string | null; roomLabel: string | null } => row !== null);

  const predictionSubjects = attendanceDisplayRows.map((row) => ({
    id: row.subject_id,
    name: attendanceVariant.labelById.get(row.subject_id) || row.subject_name,
    matchKey: attendanceVariant.variantById.get(row.subject_id) || normalizeSubjectKey(row.subject_name),
    attended: Number(row.attended_classes || 0),
    conducted: Number(row.total_classes || 0),
    attendance: Number(row.attendance_percentage || 0)
  }));

  const predictionTimetableRows = timetableItems.map((row) => ({
    id: row.id,
    dayOrder: row.dayOrder,
    subjectName: row.subjectName,
    matchKey: attendanceVariant.duplicateKeys.has(normalizeSubjectKey(row.subjectName))
      ? `${normalizeSubjectKey(row.subjectName)}|theory`
      : normalizeSubjectKey(row.subjectName),
    startTime: row.startTime || null,
    endTime: row.endTime || null,
    facultyName: row.facultyName || null,
    roomLabel: row.roomLabel || null,
    dayLabel: row.dayLabel || null
  }));

  if (!user) return null;

  return (
    <SwipeContainer>
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/80 border-b border-border/50">
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => navigate("/home")} className="flex items-center gap-2 text-sm text-muted-foreground">
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <button onClick={() => setMenuOpen(true)} className="p-2 rounded-full hover:bg-secondary transition-colors">
                <Menu className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gyaan/10">
                <BookOpen className="h-5 w-5 text-gyaan" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">Gyaan</h1>
                <p className="text-xs text-muted-foreground">
                  {syncingAttendance
                    ? "Syncing attendance and marks..."
                    : academiaStatus?.lastSyncedAt
                      ? `Synced ${new Date(academiaStatus.lastSyncedAt).toLocaleString()}`
                      : "Not synced"}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant={viewMode === "attendance" ? "default" : "outline"} size="sm" onClick={() => setViewMode("attendance")} className="flex-1 rounded-full text-xs">
                <TrendingUp className="mr-1.5 h-3.5 w-3.5" /> Attendance
              </Button>
              <Button variant={viewMode === "timetable" ? "default" : "outline"} size="sm" onClick={() => setViewMode("timetable")} className="flex-1 rounded-full text-xs">
                <Calendar className="mr-1.5 h-3.5 w-3.5" /> Timetable
              </Button>
              <Button variant={viewMode === "marks" ? "default" : "outline"} size="sm" onClick={() => setViewMode("marks")} className="flex-1 rounded-full text-xs">
                <GraduationCap className="mr-1.5 h-3.5 w-3.5" /> Marks
              </Button>
            </div>
          </div>
        </header>

        <main className="px-4 py-4 space-y-4">
          {loading && <p className="text-sm text-muted-foreground">Loading academic data...</p>}
          {visibleError && <p className="text-sm text-red-500">{visibleError}</p>}
          {academiaErrorBanner && <p className="text-xs text-warning">{academiaErrorBanner}</p>}

          {viewMode === "attendance" && (
            <>
              <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <div className="glass-card p-4 border-l-4 border-l-gyaan">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Overall Attendance</p>
                      <p className="text-4xl font-bold text-gyaan">{overallAttendance.toFixed(0)}%</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          void load({ triggerBackgroundSync: true });
                        }}
                        className="p-1.5 rounded-full hover:bg-secondary transition-colors"
                        aria-label="Refresh"
                      >
                        <RefreshCw className={`h-4 w-4 text-muted-foreground ${syncingAttendance ? "animate-spin" : ""}`} />
                      </button>
                      <div className="relative flex h-16 w-16 items-center justify-center">
                        <svg className="absolute inset-0 h-16 w-16 -rotate-90">
                          <circle cx="32" cy="32" r="28" fill="none" stroke="hsl(var(--secondary))" strokeWidth="4" />
                          <motion.circle
                            cx="32"
                            cy="32"
                            r="28"
                            fill="none"
                            stroke="hsl(var(--gyaan))"
                            strokeWidth="4"
                            strokeLinecap="round"
                            initial={{ strokeDasharray: "0 176" }}
                            animate={{ strokeDasharray: `${(Math.max(0, Math.min(100, overallAttendance)) / 100) * 176} 176` }}
                            transition={{ duration: 1.5, ease: "easeOut" }}
                          />
                        </svg>
                        <TrendingUp className="h-5 w-5 text-gyaan" />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-secondary/50 rounded-lg p-2 text-center">
                      <p className="text-xs text-muted-foreground">Subjects</p>
                      <p className="text-sm font-semibold text-foreground">{totalSubjects}</p>
                    </div>
                    <div className="bg-secondary/50 rounded-lg p-2 text-center">
                      <p className="text-xs text-muted-foreground">Below 75%</p>
                      <p className={`text-sm font-semibold ${subjectsBelow75 > 0 ? "text-critical" : "text-safe"}`}>{subjectsBelow75}</p>
                    </div>
                    <div className="bg-secondary/50 rounded-lg p-2 text-center">
                      <p className="text-xs text-muted-foreground">Total Classes</p>
                      <p className="text-sm font-semibold text-foreground">{Math.round(totalConductedClasses)}</p>
                    </div>
                  </div>
                </div>
              </motion.section>

              <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
                <Button onClick={() => setPredictionOpen(true)} variant="outline" className="w-full rounded-xl border-gyaan/30 text-gyaan hover:bg-gyaan/10">
                  Predict Attendance
                </Button>
              </motion.section>

              <div className="space-y-2">
                {attendanceDisplayRows.length === 0 ? (
                  <div className="glass-card p-4 text-sm text-muted-foreground">No attendance records yet. Connect and sync SRM Academia.</div>
                ) : (
                  attendanceDisplayRows.map((subjectRow, index) => {
                    const percentage = Number(subjectRow.attendance_percentage || 0);
                    const status = attendanceStatus(percentage);
                    const attended = Number(subjectRow.attended_classes || 0);
                    const total = Number(subjectRow.total_classes || 0);
                    const required = classesNeededFor75(attended, total);
                    const skipMargin = classesCanSkipAt75(attended, total);
                    const estimatedSemesterTotal = estimateSemesterTotalClasses(total);
                    const meta = attendanceMetaBySubject.get(normalizeSubjectKey(subjectRow.subject_name));

                    return (
                      <motion.div
                        key={subjectRow.subject_id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 + index * 0.05 }}
                        className="glass-card p-4 border-l-4 border-l-gyaan"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h3 className="font-semibold text-foreground">{attendanceVariant.labelById.get(subjectRow.subject_id) || subjectRow.subject_name}</h3>
                            {(meta?.facultyName || meta?.roomLabel) && (
                              <p className="text-xs text-muted-foreground">
                                {meta?.facultyName || "Faculty"}
                                {meta?.roomLabel ? ` • ${meta.roomLabel}` : ""}
                              </p>
                            )}
                          </div>
                          {getStatusIcon(status)}
                        </div>

                        <div className="grid grid-cols-3 gap-2 mb-2 text-center">
                          <div className="bg-secondary/40 rounded-md p-1.5">
                            <p className="text-[10px] text-muted-foreground">Attended</p>
                            <p className="text-sm font-semibold text-foreground">{Math.round(attended)}</p>
                          </div>
                          <div className="bg-secondary/40 rounded-md p-1.5">
                            <p className="text-[10px] text-muted-foreground">Conducted</p>
                            <p className="text-sm font-semibold text-foreground">{Math.round(total)}</p>
                          </div>
                          <div className="bg-secondary/40 rounded-md p-1.5">
                            <p className="text-[10px] text-muted-foreground">Total</p>
                            <p className="text-sm font-semibold text-foreground">{Math.round(estimatedSemesterTotal)}</p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between mb-2">
                          <p className={`text-2xl font-bold ${getStatusColor(status)}`}>{percentage.toFixed(0)}%</p>
                          <p className="text-xs text-muted-foreground">
                            {required > 0
                              ? `Attend next ${required}`
                              : skipMargin > 0
                                ? `Can skip next ${skipMargin}`
                                : "On 75% limit"}
                          </p>
                        </div>

                        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.max(0, Math.min(100, percentage))}%` }}
                            transition={{ duration: 0.8, delay: 0.2 + index * 0.05 }}
                            className={`h-full rounded-full ${getProgressColor(status)}`}
                          />
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>
            </>
          )}

          {viewMode === "timetable" && (
            <section className="space-y-3">
              <div className="glass-card p-4 border-l-4 border-l-gyaan">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">
                      {hasDayOrderSchedule
                        ? (hasCalendarMappedDayOrder ? "Current Day Order" : hasEstimatedDayOrder ? "Estimated Day Order" : "Day-order Timetable")
                        : "Timetable Mode"}
                    </p>
                    <p className="text-3xl font-bold text-gyaan">{hasDayOrderSchedule ? `Day ${displayedCurrentDayOrder}` : "Slot-wise"}</p>
                    {hasDayOrderSchedule && (
                      <p className="text-xs text-muted-foreground mt-1">{tomorrowStatusText}</p>
                    )}
                    {!hasDayOrderSchedule && (
                      <div className="mt-1">
                        <p className="text-xs text-muted-foreground">Day-order mapping is not published in Academia for this report.</p>
                      </div>
                    )}
                  </div>
                      <button
                        onClick={() => {
                          void load({ triggerBackgroundSync: true });
                        }}
                        className="p-2 rounded-full hover:bg-secondary transition-colors"
                        aria-label="Refresh timetable"
                      >
                    <RefreshCw className={`h-4 w-4 text-muted-foreground ${syncingAttendance ? "animate-spin" : ""}`} />
                  </button>
                </div>
              </div>

              {hasDayOrderSchedule && (
                <TimetableView
                  currentDayOrder={selectedDayOrder}
                  dayOrders={availableDayOrders}
                  classes={timetableItems}
                  onDayOrderChange={(dayOrder) => {
                    setManualDayOrderSelection(true);
                    setCurrentDayOrder(dayOrder);
                  }}
                />
              )}

              {unscheduledTimetableRows.length > 0 && (
                <div className="glass-card p-3">
                  <p className="text-xs text-muted-foreground mb-2">
                    {hasDayOrderSchedule
                      ? "Additional classes (day order not published by Academia)"
                      : "Classes from unified timetable (slot-wise)"}
                  </p>
                  <div className="space-y-1.5">
                    {unscheduledTimetableRows.map((row) => (
                      <div key={row.id} className="text-xs text-foreground/90">
                        {row.startTime ? row.startTime.slice(0, 5) : "--:--"}-{row.endTime ? row.endTime.slice(0, 5) : "--:--"}{" "}
                        {row.subjectName}
                        {row.roomLabel ? ` • ${row.roomLabel}` : ""}
                        {row.facultyName ? ` • ${row.facultyName}` : ""}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {viewMode === "marks" && (
            <section className="space-y-3">
              <MarksView
                rows={marksSubjects}
                expandedId={expandedMark}
                onToggleExpand={(id) => setExpandedMark((prev) => (prev === id ? null : id))}
              />
            </section>
          )}
        </main>

        <AttendancePrediction
          subjects={predictionSubjects}
          timetableRows={predictionTimetableRows}
          isOpen={predictionOpen}
          onClose={() => setPredictionOpen(false)}
          anchorDayOrder={displayedCurrentDayOrder}
          dayOrders={availableDayOrders.length ? availableDayOrders : [1, 2, 3, 4, 5, 6, 7]}
        />
        <ProfileMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
        <BottomNav />
      </div>
    </SwipeContainer>
  );
};

export default Gyaan;
