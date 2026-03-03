import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Menu, Dumbbell, Download } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, BarChart, Bar, PieChart, Pie, Cell } from "recharts";
import BottomNav from "@/components/BottomNav";
import { ProfileMenu } from "@/components/ProfileMenu";
import { SwipeContainer } from "@/components/SwipeContainer";
import { Button } from "@/components/ui/button";
import { apiRequest, getSessionUser } from "@/lib/api";
import { downloadHtmlReport } from "@/lib/pdfExport";

type FitnessRange = "week" | "month" | "year";

type FitnessHistory = {
  range: FitnessRange;
  sinceDate: string;
  kpis: {
    completionRate: number;
    completedActions: number;
    skippedActions: number;
    totalActions: number;
  };
  selfTrend?: {
    metric: string;
    currentValue: number | null;
    previousValue: number | null;
    delta: number | null;
    direction: "up" | "down" | "flat" | "none";
    summary: string;
  };
  fitSeries: Array<{
    date: string;
    steps: number | null;
    calories: number | null;
  }>;
  activityBreakdown: Array<{ type: string; count: number }>;
  insights: string[];
};

const PIE_COLORS = ["hsl(var(--karma))", "hsl(var(--gyaan))", "hsl(var(--ahara))", "hsl(var(--muted-foreground))"];

const HistoryWorkout = () => {
  const navigate = useNavigate();
  const user = getSessionUser();

  const [menuOpen, setMenuOpen] = useState(false);
  const [range, setRange] = useState<FitnessRange>("week");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<FitnessHistory | null>(null);

  const load = useCallback(async (nextRange: FitnessRange) => {
    try {
      setLoading(true);
      setError("");
      const resp = await apiRequest<FitnessHistory>(`/api/history/fitness?range=${nextRange}`);
      setData(resp);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workout history");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      navigate("/auth?mode=signin");
      return;
    }
    void load(range);
  }, [load, navigate, user, range]);

  const rangeLabel = useMemo(() => (range === "week" ? "Week" : range === "month" ? "Month" : "Year"), [range]);

  const stepsData = useMemo(
    () => (data?.fitSeries || []).map((r) => ({ label: r.date.slice(5), steps: r.steps ?? 0 })),
    [data]
  );
  const caloriesData = useMemo(
    () => (data?.fitSeries || []).map((r) => ({ label: r.date.slice(5), calories: r.calories ?? 0 })),
    [data]
  );

  const activityPie = useMemo(() => {
    const rows = (data?.activityBreakdown || []).filter((r) => r.count > 0);
    return rows.length ? rows : [{ type: "No activity", count: 1 }];
  }, [data]);

  const handleExport = () => {
    if (!data) return;
    downloadHtmlReport({
      title: "Workout History",
      rangeLabel,
      kpis: [
        { label: "Completion Rate", value: `${Math.round(data.kpis.completionRate)}%` },
        { label: "Done", value: String(data.kpis.completedActions) },
        { label: "Skipped", value: String(data.kpis.skippedActions) }
      ],
      insights: data.insights,
      rawData: data
    });
  };

  if (!user) return null;

  return (
    <SwipeContainer>
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/80 border-b border-border/50">
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => navigate("/profile")} className="flex items-center gap-2 text-sm text-muted-foreground">
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <button onClick={() => setMenuOpen(true)} className="p-2 rounded-full hover:bg-secondary transition-colors">
                <Menu className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-karma/10">
                <Dumbbell className="h-5 w-5 text-karma" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">Workout History</h1>
                <p className="text-xs text-muted-foreground">Fitness analytics & trends</p>
              </div>
            </div>
          </div>
        </header>

        <main className="px-4 py-4 space-y-4">
          {error && <p className="text-sm text-red-500">{error}</p>}
          {loading && <p className="text-sm text-muted-foreground">Loading history...</p>}

          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex flex-1 gap-2">
                <Button
                  size="sm"
                  variant={range === "week" ? "default" : "outline"}
                  onClick={() => setRange("week")}
                  className={`flex-1 rounded-full text-xs ${range === "week" ? "bg-karma hover:bg-karma/90" : ""}`}
                >
                  Week
                </Button>
                <Button
                  size="sm"
                  variant={range === "month" ? "default" : "outline"}
                  onClick={() => setRange("month")}
                  className={`flex-1 rounded-full text-xs ${range === "month" ? "bg-karma hover:bg-karma/90" : ""}`}
                >
                  Month
                </Button>
                <Button
                  size="sm"
                  variant={range === "year" ? "default" : "outline"}
                  onClick={() => setRange("year")}
                  className={`flex-1 rounded-full text-xs ${range === "year" ? "bg-karma hover:bg-karma/90" : ""}`}
                >
                  Year
                </Button>
              </div>
              <Button size="sm" variant="outline" className="rounded-full gap-2" onClick={handleExport} disabled={!data}>
                <Download className="h-4 w-4" />
                PDF
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="glass-card p-3 text-center">
                <p className="text-xs text-muted-foreground">Completion</p>
                <p className="text-lg font-bold text-foreground">{data ? `${Math.round(data.kpis.completionRate)}%` : "--"}</p>
              </div>
              <div className="glass-card p-3 text-center">
                <p className="text-xs text-muted-foreground">Done</p>
                <p className="text-lg font-bold text-foreground">{data ? data.kpis.completedActions : "--"}</p>
              </div>
              <div className="glass-card p-3 text-center">
                <p className="text-xs text-muted-foreground">Skipped</p>
                <p className="text-lg font-bold text-foreground">{data ? data.kpis.skippedActions : "--"}</p>
              </div>
            </div>

            <div className="glass-card p-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Self Progress</p>
                <p className="text-sm font-semibold text-foreground">{data?.selfTrend?.metric || "Workout completion"}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                {data?.selfTrend?.delta !== null && data?.selfTrend?.delta !== undefined
                  ? `${data.selfTrend.delta > 0 ? "+" : ""}${data.selfTrend.delta.toFixed(1)} pp`
                  : "Need more history"}
              </p>
            </div>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-card p-4">
            <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">Steps Trend</p>
            {stepsData.length === 0 ? (
              <div className="text-sm text-muted-foreground">No step data cached yet.</div>
            ) : (
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stepsData}>
                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip
                      contentStyle={{ background: "rgba(10,10,10,0.9)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}
                      labelStyle={{ color: "white" }}
                    />
                    <Line type="monotone" dataKey="steps" stroke="hsl(var(--karma))" strokeWidth={2.5} dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="glass-card p-4">
            <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">Calories Burned</p>
            {caloriesData.length === 0 ? (
              <div className="text-sm text-muted-foreground">No calorie data cached yet.</div>
            ) : (
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={caloriesData}>
                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip
                      contentStyle={{ background: "rgba(10,10,10,0.9)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}
                      labelStyle={{ color: "white" }}
                    />
                    <Bar dataKey="calories" fill="hsl(var(--karma))" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-4">
            <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">Activity Mix</p>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={activityPie} dataKey="count" nameKey="type" outerRadius={72} innerRadius={48} paddingAngle={2}>
                    {activityPie.map((_, idx) => (
                      <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "rgba(10,10,10,0.9)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}
                    labelStyle={{ color: "white" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
              {activityPie.slice(0, 6).map((a, idx) => (
                <div key={a.type} className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full" style={{ background: PIE_COLORS[idx % PIE_COLORS.length] }} />
                  {a.type} {a.count}
                </div>
              ))}
            </div>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Insights</p>
            {(data?.insights || []).length === 0 ? (
              <div className="glass-card p-4 text-sm text-muted-foreground">No insights yet. Log workouts to generate patterns.</div>
            ) : (
              (data?.insights || []).map((t, idx) => (
                <div key={idx} className="glass-card p-3 border-l-4 border-l-karma">
                  <p className="text-sm text-foreground">{t}</p>
                </div>
              ))
            )}
          </motion.section>
        </main>

        <ProfileMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
        <BottomNav />
      </div>
    </SwipeContainer>
  );
};

export default HistoryWorkout;
