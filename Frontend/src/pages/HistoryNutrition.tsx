import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Menu, Utensils, Download } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import BottomNav from "@/components/BottomNav";
import { ProfileMenu } from "@/components/ProfileMenu";
import { SwipeContainer } from "@/components/SwipeContainer";
import { Button } from "@/components/ui/button";
import { apiRequest, getSessionUser } from "@/lib/api";
import { downloadHtmlReport } from "@/lib/pdfExport";

type NutritionRange = "week" | "month" | "year";

type NutritionHistory = {
  range: NutritionRange;
  sinceDate: string;
  kpis: {
    avgCalories: number;
    overLimitDays: number;
    daysLogged: number;
  };
  selfTrend?: {
    metric: string;
    currentValue: number | null;
    previousValue: number | null;
    delta: number | null;
    direction: "up" | "down" | "flat" | "none";
    summary: string;
  };
  series: Array<{
    date: string;
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
  }>;
  macroTotals: {
    protein: number;
    carbs: number;
    fats: number;
  };
  insights: string[];
};

const PIE_COLORS = ["hsl(var(--critical))", "hsl(var(--ahara))", "hsl(var(--gyaan))", "hsl(var(--muted-foreground))"];

const HistoryNutrition = () => {
  const navigate = useNavigate();
  const user = getSessionUser();

  const [menuOpen, setMenuOpen] = useState(false);
  const [range, setRange] = useState<NutritionRange>("week");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<NutritionHistory | null>(null);

  const load = useCallback(async (nextRange: NutritionRange) => {
    try {
      setLoading(true);
      setError("");
      const resp = await apiRequest<NutritionHistory>(`/api/history/nutrition?range=${nextRange}`);
      setData(resp);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load nutrition history");
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

  const caloriesData = useMemo(
    () => (data?.series || []).map((r) => ({ label: r.date.slice(5), calories: r.calories })),
    [data]
  );
  const proteinData = useMemo(
    () => (data?.series || []).map((r) => ({ label: r.date.slice(5), protein: r.protein })),
    [data]
  );

  const macroPie = useMemo(() => {
    const m = data?.macroTotals;
    if (!m) return [{ name: "Protein", value: 1 }];
    const rows = [
      { name: "Protein", value: m.protein },
      { name: "Carbs", value: m.carbs },
      { name: "Fats", value: m.fats }
    ].filter((r) => r.value > 0);
    return rows.length ? rows : [{ name: "Protein", value: 1 }];
  }, [data]);

  const handleExport = () => {
    if (!data) return;
    downloadHtmlReport({
      title: "Nutrition History",
      rangeLabel,
      kpis: [
        { label: "Avg Calories", value: `${Math.round(data.kpis.avgCalories)} kcal` },
        { label: "Over-limit Days", value: String(data.kpis.overLimitDays) },
        { label: "Days Logged", value: String(data.kpis.daysLogged) }
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
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ahara/10">
                <Utensils className="h-5 w-5 text-ahara" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">Nutrition History</h1>
                <p className="text-xs text-muted-foreground">Nutrition analytics & trends</p>
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
                  className={`flex-1 rounded-full text-xs ${range === "week" ? "bg-ahara hover:bg-ahara/90 text-white" : ""}`}
                >
                  Week
                </Button>
                <Button
                  size="sm"
                  variant={range === "month" ? "default" : "outline"}
                  onClick={() => setRange("month")}
                  className={`flex-1 rounded-full text-xs ${range === "month" ? "bg-ahara hover:bg-ahara/90 text-white" : ""}`}
                >
                  Month
                </Button>
                <Button
                  size="sm"
                  variant={range === "year" ? "default" : "outline"}
                  onClick={() => setRange("year")}
                  className={`flex-1 rounded-full text-xs ${range === "year" ? "bg-ahara hover:bg-ahara/90 text-white" : ""}`}
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
                <p className="text-xs text-muted-foreground">Avg Calories</p>
                <p className="text-lg font-bold text-foreground">{data ? `${Math.round(data.kpis.avgCalories)} kcal` : "--"}</p>
              </div>
              <div className="glass-card p-3 text-center">
                <p className="text-xs text-muted-foreground">Over Limit</p>
                <p className="text-lg font-bold text-foreground">{data ? data.kpis.overLimitDays : "--"}</p>
              </div>
              <div className="glass-card p-3 text-center">
                <p className="text-xs text-muted-foreground">Days Logged</p>
                <p className="text-lg font-bold text-foreground">{data ? data.kpis.daysLogged : "--"}</p>
              </div>
            </div>

            <div className="glass-card p-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Self Progress</p>
                <p className="text-sm font-semibold text-foreground">{data?.selfTrend?.metric || "Nutrition balance"}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                {data?.selfTrend?.delta !== null && data?.selfTrend?.delta !== undefined
                  ? `${data.selfTrend.delta > 0 ? "+" : ""}${data.selfTrend.delta.toFixed(1)} pts`
                  : "Need more history"}
              </p>
            </div>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-card p-4">
            <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">Calorie Trend</p>
            {caloriesData.length === 0 ? (
              <div className="text-sm text-muted-foreground">No nutrition logs yet.</div>
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
                    <Bar dataKey="calories" fill="hsl(var(--ahara))" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="glass-card p-4">
            <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">Macro Split</p>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={macroPie} dataKey="value" nameKey="name" outerRadius={72} innerRadius={48} paddingAngle={2}>
                    {macroPie.map((_, idx) => (
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
              {macroPie.map((m, idx) => (
                <div key={m.name} className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full" style={{ background: PIE_COLORS[idx % PIE_COLORS.length] }} />
                  {m.name} {Math.round(m.value)}g
                </div>
              ))}
            </div>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-4">
            <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">Protein Trend</p>
            {proteinData.length === 0 ? (
              <div className="text-sm text-muted-foreground">No protein trend yet.</div>
            ) : (
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={proteinData}>
                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip
                      contentStyle={{ background: "rgba(10,10,10,0.9)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}
                      labelStyle={{ color: "white" }}
                    />
                    <Line type="monotone" dataKey="protein" stroke="hsl(var(--critical))" strokeWidth={2.5} dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Insights</p>
            {(data?.insights || []).length === 0 ? (
              <div className="glass-card p-4 text-sm text-muted-foreground">No insights yet. Log meals to compute trends.</div>
            ) : (
              (data?.insights || []).map((t, idx) => (
                <div key={idx} className="glass-card p-3 border-l-4 border-l-ahara">
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

export default HistoryNutrition;
