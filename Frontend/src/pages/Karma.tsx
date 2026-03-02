import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  ArrowLeft,
  Footprints,
  Flame,
  Moon,
  Heart,
  Menu,
  Dumbbell,
  Calendar,
  Coffee,
  Check,
  SkipForward,
  Thermometer,
  MapPin,
  Scale,
} from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { ProfileMenu } from "@/components/ProfileMenu";
import { SwipeContainer } from "@/components/SwipeContainer";
import { Button } from "@/components/ui/button";
import { apiRequest, getSessionUser } from "@/lib/api";
import { getLocalDateISO } from "@/lib/date";

type FitnessSummary = {
  completionRate: number;
  completedActions: number;
  totalActions: number;
  caloriesPerMinute: number | null;
  bmi: number | null;
  height: number | null;
  weight: number | null;
};

type IntegrationStatus = {
  googleConnected: boolean;
  tokenExpiry: string | null;
  fitGoogleAccountId?: string | null;
  fitGoogleAccountEmail?: string | null;
  fitGoogleAccountLocked?: boolean;
  academiaConnected?: boolean;
  academiaEmail?: string | null;
  academiaLastSyncedAt?: string | null;
  academiaLastError?: string | null;
};

type FitDaily = {
  connected: boolean;
  date: string;
  steps: number | null;
  calories: number | null;
  heartRateAvg: number | null;
  reason?: string | null;
};

type FitRangeRow = {
  metric_date: string;
  steps: number | null;
  calories: number | null;
};

type FitRange = {
  from: string;
  rows: FitRangeRow[];
};

type FitActivityRow = {
  sessionId: string | null;
  title: string;
  description: string;
  source: "gak" | "google_fit";
  activityType: number | null;
  calories: number | null;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number | null;
};

type FitActivities = {
  connected: boolean;
  fromDate: string | null;
  toDate: string | null;
  rows: FitActivityRow[];
  reason?: string | null;
};

type TodayWorkout = {
  date: string;
  hasPlan: boolean;
  isScheduledForDay?: boolean;
  plan?: {
    planId: string;
    planName: string | null;
    startTime: string | null;
    endTime: string | null;
  };
  exercises: Array<{
    exercise_id: string;
    exercise_name: string;
    sets: number | null;
    reps: string | null;
    sort_order: number;
    day_label?: string | null;
    dayLabel?: string | null;
  }>;
  session: { sessionId: string | null; status: "pending" | "done" | "skipped"; performedAt: string | null } | null;
};

type KarmaSnapshot = {
  summary: FitnessSummary | null;
  integrationStatus: IntegrationStatus | null;
  fitDaily: FitDaily | null;
  fitRange: FitRange | null;
  fitActivities: FitActivities | null;
  todayWorkout: TodayWorkout | null;
  fetchedAt: string;
};

type LoadOptions = {
  showLoading?: boolean;
  silent?: boolean;
  refreshFit?: boolean;
};

function subDaysIso(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split("-").map((x) => Number(x));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() - days);
  return dt.toISOString().slice(0, 10);
}

function buildLastNDays(dateIso: string, n: number): Array<{ date: string; label: string }> {
  const out: Array<{ date: string; label: string }> = [];
  const [y, m, d] = dateIso.split("-").map((x) => Number(x));
  const base = new Date(y, (m || 1) - 1, d || 1);
  for (let i = n - 1; i >= 0; i -= 1) {
    const dt = new Date(base);
    dt.setDate(dt.getDate() - i);
    out.push({
      date: dt.toISOString().slice(0, 10),
      label: dt.toLocaleDateString("en-US", { weekday: "short" })
    });
  }
  return out;
}

function getKarmaCacheKey(userId: string) {
  return `karma_cache_v1_${userId}`;
}

const Karma = () => {
  const navigate = useNavigate();
  const user = getSessionUser();

  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<FitnessSummary | null>(null);
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus | null>(null);
  const [fitDaily, setFitDaily] = useState<FitDaily | null>(null);
  const [fitRange, setFitRange] = useState<FitRange | null>(null);
  const [fitActivities, setFitActivities] = useState<FitActivities | null>(null);
  const [todayWorkout, setTodayWorkout] = useState<TodayWorkout | null>(null);

  const applySnapshot = useCallback((snapshot: KarmaSnapshot) => {
    setSummary(snapshot.summary || null);
    setIntegrationStatus(snapshot.integrationStatus || null);
    setFitDaily(snapshot.fitDaily || null);
    setFitRange(snapshot.fitRange || null);
    setFitActivities(snapshot.fitActivities || null);
    setTodayWorkout(snapshot.todayWorkout || null);
  }, []);

  const readCachedSnapshot = useCallback((): KarmaSnapshot | null => {
    if (!user) return null;
    try {
      const raw = window.localStorage.getItem(getKarmaCacheKey(user.userId));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return parsed as KarmaSnapshot;
    } catch {
      return null;
    }
  }, [user]);

  const writeCachedSnapshot = useCallback((snapshot: KarmaSnapshot) => {
    if (!user) return;
    try {
      window.localStorage.setItem(getKarmaCacheKey(user.userId), JSON.stringify(snapshot));
    } catch {
      // Ignore cache write errors in private mode/quota limits.
    }
  }, [user]);

  const load = useCallback(async ({ showLoading = true, silent = false, refreshFit = false }: LoadOptions = {}) => {
    if (!user) return;
    try {
      if (showLoading) {
        setLoading(true);
      }
      if (!silent) {
        setError("");
      }
      const todayIso = getLocalDateISO();
      const fromIso = subDaysIso(todayIso, 6);
      const activitiesFromIso = subDaysIso(todayIso, 13);
      const summaryPath = `/api/fitness/summary/${user.userId}${refreshFit ? "?refresh=1" : ""}`;
      const fitDailyPath = `/api/fitness/fit/daily?date=${todayIso}${refreshFit ? "&refresh=1" : ""}`;
      const [summaryResp, integrationResp, fitDailyResp, fitRangeResp, fitActivitiesResp, todayWorkoutResp] = await Promise.all([
        apiRequest<FitnessSummary>(summaryPath, { cache: "no-store", timeoutMs: refreshFit ? 12000 : 6000 }),
        apiRequest<IntegrationStatus>("/api/integrations/status", { cache: "no-store", timeoutMs: 6000 }),
        apiRequest<FitDaily>(fitDailyPath, { cache: "no-store", timeoutMs: refreshFit ? 12000 : 6000 }).catch((err) => ({
          connected: false,
          date: todayIso,
          steps: null,
          calories: null,
          heartRateAvg: null,
          reason: err instanceof Error ? err.message : "Google Fit sync failed"
        })),
        apiRequest<FitRange>(`/api/fitness/fit/range?from=${fromIso}`, { cache: "no-store", timeoutMs: 6000 }).catch(() => ({ from: fromIso, rows: [] })),
        apiRequest<FitActivities>(`/api/fitness/fit/activities?from=${activitiesFromIso}&to=${todayIso}&limit=20`, { cache: "no-store", timeoutMs: refreshFit ? 12000 : 6000 }).catch((err) => ({
          connected: false,
          fromDate: activitiesFromIso,
          toDate: todayIso,
          rows: [],
          reason: err instanceof Error ? err.message : "Google Fit activities unavailable"
        })),
        apiRequest<TodayWorkout>(`/api/fitness/workout/today?date=${todayIso}`, { cache: "no-store", timeoutMs: 6000 }).catch(() => ({
          date: todayIso,
          hasPlan: false,
          isScheduledForDay: false,
          exercises: [],
          session: null
        }))
      ]);
      const snapshot: KarmaSnapshot = {
        summary: summaryResp || null,
        integrationStatus: integrationResp || null,
        fitDaily: fitDailyResp || null,
        fitRange: fitRangeResp || null,
        fitActivities: fitActivitiesResp || null,
        todayWorkout: todayWorkoutResp || null,
        fetchedAt: new Date().toISOString()
      };
      applySnapshot(snapshot);
      writeCachedSnapshot(snapshot);

      // Body metrics are refreshed in backend as part of Fit sync; they can land slightly after the
      // first summary response. Re-check once so newly added weight/height appears without manual reload.
      if (refreshFit && (summaryResp?.weight === null || summaryResp?.height === null)) {
        window.setTimeout(() => {
          void apiRequest<FitnessSummary>(`/api/fitness/summary/${user.userId}`, { cache: "no-store" })
            .then((latestSummary) => {
              const hasNewBodyMetric =
                (latestSummary?.weight !== null && latestSummary?.weight !== undefined)
                || (latestSummary?.height !== null && latestSummary?.height !== undefined);
              if (!hasNewBodyMetric) return;
              setSummary(latestSummary);
              writeCachedSnapshot({
                ...snapshot,
                summary: latestSummary,
                fetchedAt: new Date().toISOString()
              });
            })
            .catch(() => undefined);
        }, 3000);
      }
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : "Failed to load fitness dashboard");
      }
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, [user, applySnapshot, writeCachedSnapshot]);

  useEffect(() => {
    if (!user) {
      navigate("/auth?mode=signin");
      return;
    }
    const cached = readCachedSnapshot();
    if (cached) {
      applySnapshot(cached);
      setLoading(false);
      void load({ showLoading: false, silent: true, refreshFit: false });
      window.setTimeout(() => {
        void load({ showLoading: false, silent: true, refreshFit: true });
      }, 0);
      return;
    }
    void load({ showLoading: true, silent: false, refreshFit: false })
      .finally(() => {
        window.setTimeout(() => {
          void load({ showLoading: false, silent: true, refreshFit: true });
        }, 0);
      });
  }, [applySnapshot, load, navigate, readCachedSnapshot, user]);

  const stepsGoal = 10000;
  const caloriesGoal = 500;
  const sleepGoal = 8;

  const stepsCurrent = fitDaily?.steps === null || fitDaily?.steps === undefined ? null : Number(fitDaily.steps);
  const caloriesBurned = fitDaily?.calories === null || fitDaily?.calories === undefined ? null : Number(fitDaily.calories);
  const heartRate = fitDaily?.heartRateAvg === null || fitDaily?.heartRateAvg === undefined ? null : Number(fitDaily.heartRateAvg);
  const sleepHours = null as number | null;

  const stats = [
    {
      icon: Footprints,
      label: "Steps",
      value: stepsCurrent === null ? "--" : stepsCurrent.toLocaleString(),
      subValue: `/ ${stepsGoal.toLocaleString()}`,
      percentage: stepsCurrent === null ? 0 : Math.min((stepsCurrent / stepsGoal) * 100, 100)
    },
    {
      icon: Flame,
      label: "Calories",
      value: caloriesBurned === null ? "--" : String(Math.round(caloriesBurned)),
      subValue: `/ ${caloriesGoal} kcal`,
      percentage: caloriesBurned === null ? 0 : Math.min((caloriesBurned / caloriesGoal) * 100, 100)
    },
    {
      icon: Moon,
      label: "Sleep",
      value: sleepHours === null ? "No data yet" : `${sleepHours.toFixed(1)}h`,
      subValue: sleepHours === null ? "Future scope: sleep sync" : `/ ${sleepGoal}h goal`,
      percentage: sleepHours === null ? 0 : Math.min((sleepHours / sleepGoal) * 100, 100)
    },
    {
      icon: Heart,
      label: "Heart Rate",
      value: heartRate === null ? "--" : String(Math.round(heartRate)),
      subValue: "bpm",
      percentage: heartRate === null ? 0 : Math.min(((heartRate - 50) / 100) * 100, 100)
    }
  ];

  const weight = summary?.weight === null || summary?.weight === undefined ? null : Number(summary.weight);
  const bmi = summary?.bmi === null || summary?.bmi === undefined ? null : Number(summary.bmi);
  const bmiStatus =
    bmi === null ? "--" : bmi < 18.5 ? "Underweight" : bmi < 25 ? "Normal weight" : bmi < 30 ? "Overweight" : "Obese";
  const bodyMetricHint = useMemo(() => {
    if (weight !== null) {
      return "Latest entry in `body_metric`";
    }
    if (!integrationStatus?.googleConnected) {
      return "Connect Google account to enable body metrics sync.";
    }
    if (!integrationStatus?.fitGoogleAccountLocked) {
      return "Select one Google Fit account in Profile (one-time).";
    }
    if (fitDaily && !fitDaily.connected && fitDaily.reason) {
      return fitDaily.reason;
    }
    return "No height/weight entry found in Google Fit yet.";
  }, [weight, integrationStatus, fitDaily]);

  const weeklyBars = useMemo(() => {
    const todayIso = getLocalDateISO();
    const days = buildLastNDays(todayIso, 7);
    const byDate = new Map((fitRange?.rows || []).map((r) => [String(r.metric_date).slice(0, 10), r]));
    return days.map((d) => {
      const row = byDate.get(d.date);
      const steps = row?.steps === null || row?.steps === undefined ? null : Number(row.steps);
      return { ...d, steps };
    });
  }, [fitRange]);

  const weeklyMax = Math.max(1, ...weeklyBars.map((b) => (typeof b.steps === "number" ? b.steps : 0)));
  const recentActivities = useMemo(() => {
    return Array.isArray(fitActivities?.rows) ? fitActivities.rows.slice(0, 8) : [];
  }, [fitActivities]);

  const timeRangeLabel = useMemo(() => {
    const start = todayWorkout?.plan?.startTime;
    const end = todayWorkout?.plan?.endTime;
    if (!start || !end) return null;

    const toPretty = (t: string) => {
      const m = t.match(/^(\d{2}):(\d{2})/);
      if (!m) return t;
      const dt = new Date();
      dt.setHours(Number(m[1]), Number(m[2]), 0, 0);
      return dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    };

    return `${toPretty(start)} - ${toPretty(end)}`;
  }, [todayWorkout]);

  const workoutInsight = useMemo(() => {
    if (!integrationStatus?.googleConnected) {
      return "Connect Google account to enable Google Fit sync.";
    }

    if (!integrationStatus?.fitGoogleAccountLocked) {
      return "Choose your one-time Google Fit account in Profile before syncing.";
    }

    if (fitDaily && !fitDaily.connected && fitDaily.reason) {
      return `Google Fit isn't syncing yet: ${fitDaily.reason}`;
    }

    if (heartRate !== null && heartRate !== undefined) {
      if (heartRate < 80) return "Recovery looks good today. You're ready for a full workout.";
      return "Heart rate is elevated. Consider a longer warm-up or a lighter session.";
    }

    return "Stay consistent. Start on time to protect your energy window.";
  }, [integrationStatus?.googleConnected, integrationStatus?.fitGoogleAccountLocked, heartRate, fitDaily]);

  const canLogWorkoutToday = Boolean(todayWorkout?.hasPlan && (todayWorkout?.isScheduledForDay ?? false));
  const workoutTitle = useMemo(() => {
    const fromExercises = (todayWorkout?.exercises || [])
      .map((ex) => String(ex.day_label || ex.dayLabel || "").trim())
      .filter(Boolean);
    const unique = Array.from(new Set(fromExercises));
    if (unique.length === 1) return unique[0];
    return todayWorkout?.plan?.planName || "Workout";
  }, [todayWorkout]);

  const connectGoogle = async () => {
    try {
      setError("");
      if (integrationStatus?.googleConnected && !integrationStatus?.fitGoogleAccountLocked) {
        navigate("/profile");
        return;
      }
      if (integrationStatus?.googleConnected && integrationStatus?.fitGoogleAccountLocked) {
        return;
      }
      const resp = await apiRequest<{ authUrl: string }>("/api/integrations/google/auth-url?purpose=fit");
      window.location.href = resp.authUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start Google OAuth");
    }
  };

  const setTodayAction = async (status: "done" | "skipped") => {
    try {
      if (!canLogWorkoutToday) {
        setError("No workout is scheduled for today.");
        return;
      }
      setError("");
      const todayIso = getLocalDateISO();
      const resp = await apiRequest<{ fitSyncStatus?: string | null; fitSyncReason?: string | null; fitDailyCalories?: number | null }>("/api/fitness/workout/today/action", {
        method: "POST",
        body: { date: todayIso, status }
      });
      if (status === "done" && resp?.fitSyncStatus === "failed" && resp?.fitSyncReason) {
        setError(`Workout logged, but Google Fit sync failed: ${resp.fitSyncReason}`);
      }
      await load({ showLoading: false, silent: true, refreshFit: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save workout action");
    }
  };

  if (!user) return null;

  return (
    <SwipeContainer>
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/80 border-b border-border/50">
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => navigate("/home")} className="flex items-center gap-2 text-sm text-muted-foreground">
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <button onClick={() => setMenuOpen(true)} className="p-2 rounded-full hover:bg-secondary transition-colors">
                <Menu className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-karma/10">
                <Activity className="h-5 w-5 text-karma" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">Karma</h1>
                <p className="text-xs text-muted-foreground">Fitness & Energy Tracker</p>
              </div>
            </div>
          </div>
        </header>

        <main className="px-4 py-4 space-y-4">
          {loading && <p className="text-sm text-muted-foreground">Loading fitness data...</p>}
          {error && <p className="text-sm text-red-500">{error}</p>}

          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="glass-card p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-karma/10">
                  <Activity className="h-5 w-5 text-karma" />
                </div>
                <div>
                  <p className="font-medium text-foreground text-sm">Google Fit</p>
                  <p className="text-xs text-muted-foreground">
                    {!integrationStatus?.googleConnected
                      ? "Connect to sync fitness data"
                      : integrationStatus?.fitGoogleAccountLocked
                        ? fitDaily && !fitDaily.connected && fitDaily.reason
                          ? fitDaily.reason
                          : `Locked to ${integrationStatus.fitGoogleAccountEmail || "selected account"}`
                        : "Choose Fit account once in Profile"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => void connectGoogle()}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-karma text-white hover:bg-karma/90 transition-colors"
                type="button"
              >
                {!integrationStatus?.googleConnected ? "Connect" : integrationStatus?.fitGoogleAccountLocked ? "Connected" : "Choose"}
              </button>
            </div>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <div className="flex gap-2">
              <div className="glass-card p-2.5 flex-1 flex items-center gap-2">
                <Thermometer className="h-4 w-4 text-ahara" />
                <span className="text-sm text-muted-foreground">No weather data yet</span>
              </div>
              <div className="glass-card p-2.5 flex-1 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-gyaan" />
                <span className="text-sm text-muted-foreground">No location data yet</span>
              </div>
            </div>
          </motion.section>

          <AnimatePresence>
            {todayWorkout?.hasPlan && todayWorkout?.session?.status !== "done" && todayWorkout?.session?.status !== "skipped" && (
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                transition={{ delay: 0.1 }}
              >
                <h2 className="mb-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">Today's Workout</h2>
                <div className="glass-card p-4 border-l-4 border-l-karma">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Dumbbell className="h-5 w-5 text-karma" />
                      <h3 className="font-semibold text-foreground">{workoutTitle}</h3>
                    </div>
                    {timeRangeLabel && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>{timeRangeLabel}</span>
                      </div>
                    )}
                  </div>

                  {canLogWorkoutToday ? (
                    <div className="space-y-2 mb-3">
                      {(todayWorkout?.exercises || []).length === 0 ? (
                        <div className="rounded-lg bg-secondary/30 p-3 text-sm text-muted-foreground">
                          Plan uploaded, but no exercises were parsed. Try a PDF where each exercise is like: “Bench Press 4 x 8-10”.
                        </div>
                      ) : (
                        (todayWorkout?.exercises || []).slice(0, 10).map((ex, idx, arr) => {
                          const label = String(ex.day_label || ex.dayLabel || "").trim();
                          const prevLabel = idx > 0 ? String(arr[idx - 1]?.day_label || arr[idx - 1]?.dayLabel || "").trim() : "";
                          return (
                            <div key={ex.exercise_id}>
                              {label && label !== prevLabel && (
                                <div className="mb-1 mt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                  {label}
                                </div>
                              )}
                              <div className="flex items-center justify-between text-sm text-foreground">
                                <span className="truncate pr-3">{ex.exercise_name}</span>
                                <span className="text-xs text-muted-foreground whitespace-nowrap">
                                  {ex.sets ? `${ex.sets} x ${ex.reps || "--"}` : ex.reps ? `x ${ex.reps}` : "--"}
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                      <p className="text-xs text-safe">{workoutInsight}</p>
                    </div>
                  ) : (
                    <div className="rounded-lg bg-secondary/30 p-3 text-sm text-muted-foreground mb-3">
                      No workout is scheduled for today based on your uploaded plan.
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => void setTodayAction("done")}
                      className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-safe/10 text-safe text-sm font-medium hover:bg-safe/20 transition-colors"
                      type="button"
                      disabled={!canLogWorkoutToday}
                    >
                      <Check className="h-4 w-4" />
                      Workout Done
                    </button>
                    <button
                      onClick={() => void setTodayAction("skipped")}
                      className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-secondary text-muted-foreground text-sm font-medium hover:bg-secondary/80 transition-colors"
                      type="button"
                      disabled={!canLogWorkoutToday}
                    >
                      <SkipForward className="h-4 w-4" />
                      Skip Today
                    </button>
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          {todayWorkout?.hasPlan && (todayWorkout?.session?.status === "done" || todayWorkout?.session?.status === "skipped") && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="rounded-lg bg-safe/10 border border-safe/30 p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-karma/10">
                  <Coffee className="h-6 w-6 text-karma" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Logged</h3>
                  <p className="text-sm text-muted-foreground">
                    {todayWorkout?.session?.status === "done" ? "Workout completed." : "Workout skipped."}
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">Stats</h2>
            <div className="grid grid-cols-2 gap-2">
              {stats.map((stat, index) => {
                const Icon = stat.icon;
                return (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.18 + index * 0.05 }}
                    className="glass-card p-3"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-karma" />
                        <p className="text-xs text-muted-foreground">{stat.label}</p>
                      </div>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <p className="text-lg font-bold text-foreground">{stat.value}</p>
                      <p className="text-xs text-muted-foreground">{stat.subValue}</p>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(0, Math.min(100, stat.percentage))}%` }}
                        transition={{ duration: 0.8, delay: 0.25 + index * 0.05 }}
                        className="h-full rounded-full bg-karma"
                      />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">Body Metrics</h2>
            <div className="grid grid-cols-2 gap-2">
              <div className="glass-card p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Scale className="h-4 w-4 text-karma" />
                  <p className="text-xs text-muted-foreground">Weight</p>
                </div>
                <p className="text-2xl font-bold text-foreground">{weight === null ? "--" : `${weight.toFixed(1)} kg`}</p>
                <p className="text-xs text-muted-foreground mt-1">{bodyMetricHint}</p>
              </div>
              <div className="glass-card p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="h-4 w-4 text-karma" />
                  <p className="text-xs text-muted-foreground">BMI</p>
                </div>
                <p className="text-2xl font-bold text-foreground">{bmi === null ? "--" : bmi.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground mt-1">{bmiStatus}</p>
              </div>
            </div>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">Heart Rate</h2>
            <div className="glass-card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-critical/10">
                    <Heart className="h-5 w-5 text-critical" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{heartRate === null ? "--" : `${Math.round(heartRate)} bpm`}</p>
                    <p className="text-xs text-muted-foreground">From Google Fit daily aggregate (avg)</p>
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>Resting: --</p>
                  <p>Max Today: --</p>
                </div>
              </div>
            </div>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">Weekly Steps</h2>
            <div className="glass-card p-4">
              {weeklyBars.every((b) => b.steps === null) ? (
                <p className="text-sm text-muted-foreground">No weekly step data cached yet. Connect Google Fit to populate.</p>
              ) : (
                <div className="grid grid-cols-7 gap-2 items-end h-24">
                  {weeklyBars.map((b) => {
                    const pct = b.steps === null ? 0 : Math.round((b.steps / weeklyMax) * 100);
                    return (
                      <div key={b.date} className="flex flex-col items-center gap-1">
                        <div className="w-full h-16 flex items-end">
                          <div
                            className={`w-full rounded-md ${b.steps === null ? "bg-secondary" : "bg-karma"}`}
                            style={{ height: `${Math.max(6, pct)}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground">{b.label}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">Activities</h2>
            <div className="space-y-2">
              {recentActivities.length === 0 ? (
                <div className="glass-card p-4 text-sm text-muted-foreground">
                  {fitActivities && fitActivities.connected
                    ? "No Google Fit activities found for the recent window."
                    : fitActivities?.reason || "Connect Google Fit to see logged activities."}
                </div>
              ) : (
                recentActivities.map((row, idx) => {
                  const start = row.startTime ? new Date(row.startTime) : null;
                  const end = row.endTime ? new Date(row.endTime) : null;
                  const timeLabel = start
                    ? `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} • ${start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}${end ? ` - ${end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}`
                    : "Time unavailable";
                  return (
                    <motion.div
                      key={`${row.sessionId || row.title}-${idx}`}
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.42 + idx * 0.03 }}
                      className="glass-card p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-karma/10">
                            <Dumbbell className="h-4.5 w-4.5 text-karma" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{row.title || "Workout"}</p>
                            <p className="text-xs text-muted-foreground truncate">{timeLabel}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-foreground">
                            {row.calories === null || row.calories === undefined ? "--" : `${Math.round(Number(row.calories))} kcal`}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {row.durationMinutes ? `${Math.round(Number(row.durationMinutes))} min` : "duration --"}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </motion.section>
        </main>

        <ProfileMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
        <BottomNav />
      </div>
    </SwipeContainer>
  );
};

export default Karma;
