import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { BookOpen, Activity, Utensils, TrendingUp, Calendar, Menu } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { ProfileMenu } from "@/components/ProfileMenu";
import { SwipeContainer } from "@/components/SwipeContainer";
import { apiRequest, getSessionUser } from "@/lib/api";

type Summary = {
  summary: {
    academic_score_index: number;
    fitness_discipline_index: number;
    nutrition_balance_index: number;
    overall_consistency_index: number;
  } | null;
  recommendations: Array<{
    id: string;
    domain: string;
    recommendation_text: string;
  }>;
  scorecards?: {
    gyaan?: { score: number; topPercent: number | null; band: string };
    karma?: { score: number; topPercent: number | null; band: string };
    ahara?: { score: number; topPercent: number | null; band: string };
    overall?: { score: number; topPercent: number | null; band: string };
  };
  behaviorAnalysis?: {
    reasons: Array<{
      id: string;
      domain: string;
      severity: "low" | "medium" | "high";
      title: string;
      description: string;
      evidence: string[];
    }>;
    warnings: Array<{
      id: string;
      domain: string;
      severity: "low" | "medium" | "high";
      text: string;
    }>;
    insights: Array<{
      id: string;
      domain: string;
      text: string;
    }>;
    dataStatus?: {
      hasAcademicData: boolean;
      hasFitnessData: boolean;
      hasNutritionData: boolean;
      hasDeadlineData: boolean;
    };
  };
  deadlineIntelligence?: {
    items: Array<{
      id: string;
      status: "safe" | "needs-attention" | "at-risk";
      title: string;
      daysLeft: number;
      studyMinutesPerDay: number;
    }>;
  };
  dailyOptimization?: {
    date: string;
    previousWindowDays: number;
    previousOverallAvg: number;
    delta: number;
    trend: "improving" | "declining" | "steady";
  };
};

type PillarKey = "gyaan" | "karma" | "ahara";
type HomeSnapshot = {
  data: Summary;
  fetchedAt: string;
};

type LoadOptions = {
  showLoading?: boolean;
  silent?: boolean;
};

function getHomeCacheKey(userId: string) {
  return `home_cache_v1_${userId}`;
}

function getStatus(score: number): string {
  if (score >= 80) return "On Track";
  if (score >= 60) return "Active";
  return "Needs Attention";
}

const Home = () => {
  const navigate = useNavigate();
  const user = getSessionUser();

  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<Summary>({ summary: null, recommendations: [] });

  const applySnapshot = useCallback((snapshot: HomeSnapshot) => {
    setData(snapshot.data || { summary: null, recommendations: [] });
  }, []);

  const readCachedSnapshot = useCallback((): HomeSnapshot | null => {
    if (!user) return null;
    try {
      const raw = window.localStorage.getItem(getHomeCacheKey(user.userId));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return parsed as HomeSnapshot;
    } catch {
      return null;
    }
  }, [user]);

  const writeCachedSnapshot = useCallback((snapshot: HomeSnapshot) => {
    if (!user) return;
    try {
      window.localStorage.setItem(getHomeCacheKey(user.userId), JSON.stringify(snapshot));
    } catch {
      // Ignore cache write failures.
    }
  }, [user]);

  const load = useCallback(async ({ showLoading = true, silent = false }: LoadOptions = {}) => {
    if (!user) return;
    try {
      if (showLoading) {
        setLoading(true);
      }
      if (!silent) {
        setError("");
      }
      const resp = await apiRequest<Summary>("/api/advanced-analytics/behavior-summary", {
        cache: "no-store",
        timeoutMs: 7000
      });
      setData(resp);
      writeCachedSnapshot({ data: resp, fetchedAt: new Date().toISOString() });
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      }
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, [user, writeCachedSnapshot]);

  useEffect(() => {
    if (!user) {
      navigate("/auth?mode=signin");
      return;
    }
    const cached = readCachedSnapshot();
    if (cached) {
      applySnapshot(cached);
      setLoading(false);
      void load({ showLoading: false, silent: true });
      return;
    }
    void load({ showLoading: true, silent: false });
  }, [applySnapshot, load, navigate, readCachedSnapshot, user]);

  if (!user) {
    return null;
  }

  const summary = data.summary;
  const optimizationScore = Math.round(Number(summary?.overall_consistency_index ?? 0));
  const scorecards = data.scorecards || {};

  const pillars = [
    {
      key: "gyaan" as PillarKey,
      name: "Gyaan",
      subtitle: "Academics",
      icon: BookOpen,
      percentage: Number(summary?.academic_score_index ?? 0),
      status: scorecards.gyaan?.band || getStatus(Number(summary?.academic_score_index ?? 0)),
      path: "/gyaan"
    },
    {
      key: "karma" as PillarKey,
      name: "Karma",
      subtitle: "Fitness",
      icon: Activity,
      percentage: Number(summary?.fitness_discipline_index ?? 0),
      status: scorecards.karma?.band || getStatus(Number(summary?.fitness_discipline_index ?? 0)),
      path: "/karma"
    },
    {
      key: "ahara" as PillarKey,
      name: "Ahara",
      subtitle: "Nutrition",
      icon: Utensils,
      percentage: Number(summary?.nutrition_balance_index ?? 0),
      status: scorecards.ahara?.band || getStatus(Number(summary?.nutrition_balance_index ?? 0)),
      path: "/ahara"
    }
  ];

  const aiInsight = data.behaviorAnalysis?.reasons?.[0]?.description || data.recommendations[0]?.recommendation_text || "No recommendation available yet.";
  const dailyDelta = Number(data.dailyOptimization?.delta || 0);
  const dailyTrendText = data.dailyOptimization
    ? (dailyDelta > 0
      ? `Up ${dailyDelta.toFixed(1)} vs previous ${data.dailyOptimization.previousWindowDays} days`
      : dailyDelta < 0
        ? `Down ${Math.abs(dailyDelta).toFixed(1)} vs previous ${data.dailyOptimization.previousWindowDays} days`
        : `Flat vs previous ${data.dailyOptimization.previousWindowDays} days`)
    : null;
  const priorities = [
    ...(data.behaviorAnalysis?.warnings || []).map((w) => ({
      id: w.id,
      domain: w.domain,
      recommendation_text: w.text
    })),
    ...data.recommendations
  ].slice(0, 3);
  const topReasons = (data.behaviorAnalysis?.reasons || []).slice(0, 2);
  const quickInsights = (data.behaviorAnalysis?.insights || []).slice(0, 2);
  const urgentDeadline = (data.deadlineIntelligence?.items || []).find((item) => item.status === "at-risk");

  const getBorderColor = (key: PillarKey) => {
    switch (key) {
      case "gyaan":
        return "border-l-gyaan";
      case "karma":
        return "border-l-karma";
      case "ahara":
        return "border-l-ahara";
      default:
        return "border-l-primary";
    }
  };

  const getTextColor = (key: PillarKey) => {
    switch (key) {
      case "gyaan":
        return "text-gyaan";
      case "karma":
        return "text-karma";
      case "ahara":
        return "text-ahara";
      default:
        return "text-primary";
    }
  };

  const getIconBg = (key: PillarKey) => {
    switch (key) {
      case "gyaan":
        return "bg-gyaan/10";
      case "karma":
        return "bg-karma/10";
      case "ahara":
        return "bg-ahara/10";
      default:
        return "bg-primary/10";
    }
  };

  return (
    <SwipeContainer>
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/80 border-b border-border/50">
          <div className="px-4 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Welcome</p>
                <h1 className="text-2xl font-bold text-foreground">{user.fullName}</h1>
              </div>
              <div className="flex items-center gap-2">
                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="h-10 w-10">
                  <img src="/favicon.svg" alt="GAK logo" className="h-10 w-10 rounded-full object-cover" />
                </motion.div>
                <button onClick={() => setMenuOpen(true)} className="p-2 rounded-full hover:bg-secondary transition-colors">
                  <Menu className="h-5 w-5 text-muted-foreground" />
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="px-4 py-4 space-y-6">
          {loading && <p className="text-sm text-muted-foreground">Loading dashboard...</p>}
          {error && <p className="text-sm text-red-500">{error}</p>}

          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="glass-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Daily Optimization Score</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-foreground">{optimizationScore}</span>
                    <span className="text-muted-foreground">/100</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">{aiInsight}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {scorecards.overall?.band || getStatus(optimizationScore)}
                  </p>
                  {dailyTrendText && (
                    <p className="text-xs text-muted-foreground mt-1">{dailyTrendText}</p>
                  )}
                  {urgentDeadline && (
                    <p className="text-xs text-warning mt-1">
                      Urgent: {urgentDeadline.title} needs ~{urgentDeadline.studyMinutesPerDay} min/day now.
                    </p>
                  )}
                </div>
                <div className="relative flex h-16 w-16 items-center justify-center">
                  <svg className="absolute inset-0 h-16 w-16 -rotate-90">
                    <circle cx="32" cy="32" r="28" fill="none" stroke="hsl(var(--secondary))" strokeWidth="4" />
                    <motion.circle
                      cx="32"
                      cy="32"
                      r="28"
                      fill="none"
                      stroke="hsl(var(--gak))"
                      strokeWidth="4"
                      strokeLinecap="round"
                      initial={{ strokeDasharray: "0 176" }}
                      animate={{ strokeDasharray: `${(Math.max(0, Math.min(100, optimizationScore)) / 100) * 176} 176` }}
                      transition={{ duration: 1.2, ease: "easeOut" }}
                    />
                  </svg>
                  <TrendingUp className="h-5 w-5 text-gak" />
                </div>
              </div>
            </div>
          </motion.section>

          <section>
            <h2 className="mb-4 text-base font-semibold text-foreground">The Trinity</h2>
            <div className="space-y-3">
              {pillars.map((pillar, index) => {
                const Icon = pillar.icon;
                return (
                  <motion.div
                    key={pillar.key}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + index * 0.1 }}
                    onClick={() => navigate(pillar.path)}
                    className={`glass-card p-4 border-l-4 ${getBorderColor(pillar.key)} cursor-pointer hover:bg-secondary/30 transition-colors`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${getIconBg(pillar.key)}`}>
                          <Icon className={`h-5 w-5 ${getTextColor(pillar.key)}`} />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground">{pillar.name}</h3>
                          <p className="text-xs text-muted-foreground">{pillar.subtitle}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-2xl font-bold ${getTextColor(pillar.key)}`}>{pillar.percentage.toFixed(0)}%</p>
                        <p className="text-xs text-muted-foreground">{pillar.status}</p>
                      </div>
                    </div>
                    <div className="mt-3 h-1.5 rounded-full bg-secondary overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(0, Math.min(100, pillar.percentage))}%` }}
                        transition={{ duration: 1, delay: 0.3 + index * 0.1 }}
                        className={`h-full rounded-full ${
                          pillar.key === "gyaan" ? "bg-gyaan" : pillar.key === "karma" ? "bg-karma" : "bg-ahara"
                        }`}
                      />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </section>

          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-foreground">Today's Priorities</h2>
              <button onClick={() => navigate("/planner")} className="flex items-center gap-1 text-sm text-gak">
                <Calendar className="h-4 w-4" />
                View Plan
              </button>
            </div>
            <div className="space-y-3">
              {priorities.length === 0 ? (
                <div className="rounded-lg border-l-4 p-4 bg-secondary/30 border-l-border">
                  <p className="text-sm text-foreground">No live priorities yet. Add attendance, workouts, and meals to generate recommendations.</p>
                </div>
              ) : (
                priorities.map((priority, index) => (
                  <motion.div
                    key={priority.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + index * 0.1 }}
                    className={`rounded-lg border-l-4 p-4 bg-secondary/30 ${
                      priority.domain === "academic"
                        ? "border-l-gyaan"
                        : priority.domain === "fitness"
                          ? "border-l-karma"
                          : "border-l-ahara"
                    }`}
                  >
                    <p className="text-sm text-foreground">{priority.recommendation_text}</p>
                  </motion.div>
                ))
              )}
            </div>
          </motion.section>

          {(topReasons.length > 0 || quickInsights.length > 0) && (
            <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
              <h2 className="mb-4 text-base font-semibold text-foreground">Behavior Insights</h2>
              <div className="space-y-3">
                {topReasons.map((reason, index) => (
                  <motion.div
                    key={reason.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.55 + index * 0.1 }}
                    className={`rounded-lg border-l-4 p-4 bg-secondary/30 ${
                      reason.domain === "academic"
                        ? "border-l-gyaan"
                        : reason.domain === "fitness"
                          ? "border-l-karma"
                          : "border-l-ahara"
                    }`}
                  >
                    <p className="text-sm font-medium text-foreground">{reason.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{reason.description}</p>
                  </motion.div>
                ))}

                {quickInsights.map((insight, index) => (
                  <motion.div
                    key={insight.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.65 + index * 0.1 }}
                    className="rounded-lg border-l-4 border-l-gak p-4 bg-secondary/30"
                  >
                    <p className="text-sm text-foreground">{insight.text}</p>
                  </motion.div>
                ))}
              </div>
            </motion.section>
          )}
        </main>

        <ProfileMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
        <BottomNav />
      </div>
    </SwipeContainer>
  );
};

export default Home;
