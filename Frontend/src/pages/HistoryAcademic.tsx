import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Menu, BookOpen, Download } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, BarChart, Bar, PieChart, Pie, Cell } from "recharts";
import BottomNav from "@/components/BottomNav";
import { ProfileMenu } from "@/components/ProfileMenu";
import { SwipeContainer } from "@/components/SwipeContainer";
import { Button } from "@/components/ui/button";
import { apiRequest, getSessionUser } from "@/lib/api";
import { downloadHtmlReport } from "@/lib/pdfExport";

type AcademicRange = "semester" | "year" | "all";

type AcademicHistory = {
  range: AcademicRange;
  kpis: {
    cgpa: number | null;
    attendancePercent: number | null;
    semester: number | null;
  };
  standing?: {
    rank: number | null;
    totalUsers: number | null;
    topPercent: number | null;
    band: string;
  };
  gpaTrend: Array<{ semester: number; cgpa: number }>;
  attendanceByMonth: Array<{ month: string; key: string; attendancePercentage: number }>;
  creditDistribution: { core: number; elective: number; lab: number };
  subjects: Array<{
    subjectId: string;
    subjectName: string;
    credits: number;
    averagePercentage: number | null;
    attendancePercentage: number | null;
    sectionRank?: number | null;
    classSize?: number | null;
    topPercent?: number | null;
  }>;
  insights: string[];
};

const PIE_COLORS = [
  "hsl(var(--gyaan))",
  "hsl(var(--warning))",
  "hsl(var(--safe))",
  "hsl(var(--muted-foreground))"
];

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

const HistoryAcademic = () => {
  const navigate = useNavigate();
  const user = getSessionUser();

  const [menuOpen, setMenuOpen] = useState(false);
  const [range, setRange] = useState<AcademicRange>("semester");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<AcademicHistory | null>(null);

  const load = useCallback(async (nextRange: AcademicRange) => {
    try {
      setLoading(true);
      setError("");
      const resp = await apiRequest<AcademicHistory>(`/api/history/academic?range=${nextRange}`);
      setData(resp);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load academic history");
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

  const rangeLabel = useMemo(() => (range === "semester" ? "Semester" : range === "year" ? "Year" : "All Time"), [range]);

  const pieData = useMemo(() => {
    const cd = data?.creditDistribution;
    if (!cd) return [];
    const rows = [
      { name: "Core", value: cd.core },
      { name: "Elective", value: cd.elective },
      { name: "Lab", value: cd.lab }
    ].filter((r) => r.value > 0);
    return rows.length ? rows : [{ name: "Core", value: 1 }];
  }, [data]);

  const handleExport = () => {
    if (!data) return;
    downloadHtmlReport({
      title: "Academic History",
      rangeLabel,
      kpis: [
        { label: "CGPA (Derived)", value: data.kpis.cgpa === null ? "--" : data.kpis.cgpa.toFixed(2) },
        { label: "Attendance", value: data.kpis.attendancePercent === null ? "--" : `${Math.round(data.kpis.attendancePercent)}%` },
        { label: "Semester", value: data.kpis.semester === null ? "--" : ordinal(data.kpis.semester) }
      ],
      insights: data.insights,
      rawData: data
    });
  };

  if (!user) return null;

  const cgpa = data?.kpis.cgpa;
  const attendance = data?.kpis.attendancePercent;
  const semester = data?.kpis.semester;
  const standing = data?.standing;

  const gpaChartData = (data?.gpaTrend || []).map((r) => ({ label: `S${r.semester}`, cgpa: r.cgpa }));
  const attendanceChartData = (data?.attendanceByMonth || []).map((r) => ({ label: r.month, attendance: r.attendancePercentage }));
  const subjectStandingRows = (data?.subjects || [])
    .filter((row) => typeof row.topPercent === "number" && typeof row.classSize === "number" && Number(row.classSize) >= 3)
    .sort((a, b) => Number(a.topPercent) - Number(b.topPercent))
    .slice(0, 6);

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
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gyaan/10">
                <BookOpen className="h-5 w-5 text-gyaan" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">Academic History</h1>
                <p className="text-xs text-muted-foreground">Track your academic journey</p>
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
                  variant={range === "semester" ? "default" : "outline"}
                  onClick={() => setRange("semester")}
                  className={`flex-1 rounded-full text-xs ${range === "semester" ? "bg-gyaan hover:bg-gyaan/90" : ""}`}
                >
                  Semester
                </Button>
                <Button
                  size="sm"
                  variant={range === "year" ? "default" : "outline"}
                  onClick={() => setRange("year")}
                  className={`flex-1 rounded-full text-xs ${range === "year" ? "bg-gyaan hover:bg-gyaan/90" : ""}`}
                >
                  Year
                </Button>
                <Button
                  size="sm"
                  variant={range === "all" ? "default" : "outline"}
                  onClick={() => setRange("all")}
                  className={`flex-1 rounded-full text-xs ${range === "all" ? "bg-gyaan hover:bg-gyaan/90" : ""}`}
                >
                  All Time
                </Button>
              </div>
              <Button size="sm" variant="outline" className="rounded-full gap-2" onClick={handleExport} disabled={!data}>
                <Download className="h-4 w-4" />
                PDF
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="glass-card p-3 text-center">
                <p className="text-xs text-muted-foreground">CGPA</p>
                <p className="text-lg font-bold text-foreground">{cgpa === null || cgpa === undefined ? "--" : cgpa.toFixed(2)}</p>
              </div>
              <div className="glass-card p-3 text-center">
                <p className="text-xs text-muted-foreground">Attendance</p>
                <p className="text-lg font-bold text-foreground">{attendance === null || attendance === undefined ? "--" : `${Math.round(attendance)}%`}</p>
              </div>
              <div className="glass-card p-3 text-center">
                <p className="text-xs text-muted-foreground">Semester</p>
                <p className="text-lg font-bold text-foreground">{semester === null || semester === undefined ? "--" : ordinal(semester)}</p>
              </div>
            </div>

            <div className="glass-card p-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Academic Standing</p>
                <p className="text-sm font-semibold text-foreground">{standing?.band || "No cohort data yet"}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                {standing?.topPercent !== null && standing?.topPercent !== undefined
                  ? `Top ${standing.topPercent}%`
                  : "Need more users"}
              </p>
            </div>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-card p-4">
            <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">GPA Trend</p>
            {gpaChartData.length === 0 ? (
              <div className="text-sm text-muted-foreground">No marks yet for GPA trend.</div>
            ) : (
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={gpaChartData}>
                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis domain={[0, 10]} stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip
                      contentStyle={{ background: "rgba(10,10,10,0.9)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}
                      labelStyle={{ color: "white" }}
                    />
                    <Line type="monotone" dataKey="cgpa" stroke="hsl(var(--gyaan))" strokeWidth={2.5} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="glass-card p-4">
            <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">Attendance This Period</p>
            {attendanceChartData.length === 0 ? (
              <div className="text-sm text-muted-foreground">No attendance records yet.</div>
            ) : (
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={attendanceChartData}>
                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis domain={[0, 100]} stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip
                      contentStyle={{ background: "rgba(10,10,10,0.9)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}
                      labelStyle={{ color: "white" }}
                    />
                    <Bar dataKey="attendance" fill="hsl(var(--gyaan))" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Credit Distribution</p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {pieData.map((p, idx) => (
                  <div key={p.name} className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full" style={{ background: PIE_COLORS[idx % PIE_COLORS.length] }} />
                    {p.name} {p.value}
                  </div>
                ))}
              </div>
            </div>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={72} innerRadius={48} paddingAngle={2}>
                    {pieData.map((_, idx) => (
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
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Insights</p>
            {(data?.insights || []).length === 0 ? (
              <div className="glass-card p-4 text-sm text-muted-foreground">No insights yet. Add marks/attendance records to generate trends.</div>
            ) : (
              (data?.insights || []).map((t, idx) => (
                <div key={idx} className="glass-card p-3 border-l-4 border-l-gyaan">
                  <p className="text-sm text-foreground">{t}</p>
                </div>
              ))
            )}
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }} className="space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Subject Standing</p>
            {subjectStandingRows.length === 0 ? (
              <div className="glass-card p-4 text-sm text-muted-foreground">No section standing data yet for this range.</div>
            ) : (
              subjectStandingRows.map((row) => (
                <div key={row.subjectId} className="glass-card p-3 border-l-4 border-l-gyaan flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground truncate">{row.subjectName}</p>
                    <p className="text-xs text-muted-foreground">
                      Rank {row.sectionRank}/{row.classSize}
                    </p>
                  </div>
                  <p className="text-xs font-medium text-gyaan whitespace-nowrap">Top {Math.round(Number(row.topPercent))}%</p>
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

export default HistoryAcademic;
