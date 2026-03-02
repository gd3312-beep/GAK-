import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Menu, FileText } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { ProfileMenu } from "@/components/ProfileMenu";
import { SwipeContainer } from "@/components/SwipeContainer";
import { apiRequest, getSessionUser } from "@/lib/api";
import { MarksView, type MarksSubjectRow } from "@/components/MarksView";

type PerformanceRow = {
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

function buildMarksSubjects(perfRows: PerformanceRow[], detailRows: MarksDetailRow[]): MarksSubjectRow[] {
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
      subjectName: p.subject_name,
      avgPct: Number(p.average_percentage || 0),
      components: [],
      topPercent: p.top_percent === undefined || p.top_percent === null ? null : Number(p.top_percent),
      sectionRank: p.section_rank === undefined || p.section_rank === null ? null : Number(p.section_rank),
      classSize: p.class_size === undefined || p.class_size === null ? null : Number(p.class_size)
    });
  }

  for (const d of detailRows) {
    const current =
      bySubject.get(d.subject_id)
      || { subjectName: d.subject_name, avgPct: 0, components: [], topPercent: null, sectionRank: null, classSize: null };

    current.components.push({
      id: d.marks_id,
      name: d.component_type,
      obtained: Number(d.score),
      total: Number(d.max_score)
    });
    bySubject.set(d.subject_id, current);
  }

  return Array.from(bySubject.entries()).map(([id, value]) => ({
    id,
    subjectName: value.subjectName,
    averagePercentage: value.avgPct,
    components: value.components,
    topPercent: value.topPercent,
    sectionRank: value.sectionRank,
    classSize: value.classSize
  }));
}

const Marks = () => {
  const navigate = useNavigate();
  const user = getSessionUser();

  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PerformanceRow[]>([]);
  const [detailRows, setDetailRows] = useState<MarksDetailRow[]>([]);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError("");
      const [performanceResp, detailsResp] = await Promise.all([
        apiRequest<PerformanceRow[]>(`/api/academic/performance/${user.userId}`),
        apiRequest<MarksDetailRow[]>(`/api/academic/marks/${user.userId}`)
      ]);

      setRows(performanceResp);
      setDetailRows(detailsResp || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load marks");
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

  if (!user) return null;
  const marksSubjects = buildMarksSubjects(rows, detailRows);

  return (
    <SwipeContainer>
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/80 border-b border-border/50">
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => navigate("/gyaan")} className="flex items-center gap-2 text-sm text-muted-foreground">
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <button onClick={() => setMenuOpen(true)} className="p-2 rounded-full hover:bg-secondary transition-colors">
                <Menu className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gyaan/10">
                <FileText className="h-5 w-5 text-gyaan" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">Marks</h1>
                <p className="text-xs text-muted-foreground">Academic performance tracking</p>
              </div>
            </div>
          </div>
        </header>

        <main className="px-4 py-4 space-y-4">
          {loading && <p className="text-sm text-muted-foreground">Loading marks...</p>}
          {error && <p className="text-sm text-red-500">{error}</p>}

          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <MarksView rows={marksSubjects} expandedId={expandedId} onToggleExpand={(id) => setExpandedId((prev) => (prev === id ? null : id))} />
          </motion.section>
        </main>

        <ProfileMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
        <BottomNav />
      </div>
    </SwipeContainer>
  );
};

export default Marks;
