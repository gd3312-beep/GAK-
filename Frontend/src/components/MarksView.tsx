import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus, Sparkles } from "lucide-react";

export type MarkComponentRow = {
  id: string;
  name: string;
  obtained: number;
  total: number;
};

export interface MarksSubjectRow {
  id: string;
  subjectName: string;
  averagePercentage: number;
  components: MarkComponentRow[];
  // Optional class standing fields (computed in backend, not mocked).
  topPercent?: number | null;
  sectionRank?: number | null;
  classSize?: number | null;
}

interface MarksViewProps {
  rows: MarksSubjectRow[];
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
}

function getRisk(percentage: number): "low" | "medium" | "high" {
  if (percentage >= 75) return "low";
  if (percentage >= 60) return "medium";
  return "high";
}

function getRiskStyles(risk: "low" | "medium" | "high") {
  switch (risk) {
    case "low":
      return { color: "text-safe", bg: "bg-safe/10", border: "border-l-safe" };
    case "medium":
      return { color: "text-warning", bg: "bg-warning/10", border: "border-l-warning" };
    default:
      return { color: "text-critical", bg: "bg-critical/10", border: "border-l-critical" };
  }
}

function trendIcon(percentage: number) {
  if (percentage >= 75) return <TrendingUp className="h-4 w-4 text-safe" />;
  if (percentage >= 60) return <Minus className="h-4 w-4 text-warning" />;
  return <TrendingDown className="h-4 w-4 text-critical" />;
}

function standingStyles(topPercent: number) {
  if (topPercent <= 10) return { color: "text-safe", bg: "bg-safe/10", border: "border-safe/20" };
  if (topPercent <= 25) return { color: "text-warning", bg: "bg-warning/10", border: "border-warning/20" };
  return { color: "text-critical", bg: "bg-critical/10", border: "border-critical/20" };
}

export function MarksView({ rows, expandedId, onToggleExpand }: MarksViewProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border-l-4 border-l-gyaan p-3 bg-gyaan/5">
        <div className="flex items-start gap-2">
          <Sparkles className="h-4 w-4 text-gyaan mt-0.5 flex-shrink-0" />
          <p className="text-sm text-foreground">
            Marks are computed from your live mark records stored in the database. Class standing is computed using SQL ranking within your section (if available).
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {rows.length === 0 ? (
          <div className="glass-card p-4 text-sm text-muted-foreground">No marks data available yet.</div>
        ) : (
          rows.map((subject, index) => {
            const risk = getRisk(subject.averagePercentage);
            const styles = getRiskStyles(risk);
            const percentage = Math.max(0, Math.min(100, subject.averagePercentage));
            const isExpanded = expandedId === subject.id;

            return (
              <motion.div
                key={subject.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`glass-card p-3 border-l-4 ${styles.border}`}
              >
                <button className="w-full text-left" onClick={() => onToggleExpand(subject.id)}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-foreground">{subject.subjectName}</h4>
                      {trendIcon(subject.averagePercentage)}
                    </div>
                    <div className="flex items-center gap-2">
                      {typeof subject.topPercent === "number" && typeof subject.classSize === "number" && subject.classSize >= 3 && (
                        <div
                          className={`px-2 py-0.5 rounded-full text-xs font-medium border ${standingStyles(subject.topPercent).bg} ${standingStyles(subject.topPercent).color} ${standingStyles(subject.topPercent).border}`}
                        >
                          You are in top {Math.max(1, Math.round(subject.topPercent))}%
                        </div>
                      )}
                      <div className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles.bg} ${styles.color}`}>
                        {risk === "high" ? "At Risk" : risk === "medium" ? "Needs Focus" : "On Track"}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-center mb-2">
                    <div className="bg-secondary/50 rounded-lg p-2">
                      <p className="text-xs text-muted-foreground">Average</p>
                      <p className="text-sm font-semibold text-foreground">{subject.averagePercentage.toFixed(1)}%</p>
                    </div>
                    <div className="bg-gyaan/10 rounded-lg p-2">
                      <p className="text-xs text-muted-foreground">Components</p>
                      <p className="text-sm font-semibold text-gyaan">{subject.components.length}</p>
                    </div>
                  </div>

                  <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      transition={{ duration: 0.8, delay: 0.2 + index * 0.05 }}
                      className={`h-full rounded-full ${risk === "high" ? "bg-critical" : risk === "medium" ? "bg-warning" : "bg-gyaan"}`}
                    />
                  </div>
                </button>

                {isExpanded && (
                  <div className="mt-3 space-y-2">
                    {typeof subject.sectionRank === "number" && typeof subject.classSize === "number" && subject.classSize >= 3 && (
                      <div className="bg-secondary/40 rounded-lg p-2 flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">Section Rank</p>
                        <p className="text-xs font-semibold text-foreground">
                          {subject.sectionRank}/{subject.classSize}
                        </p>
                      </div>
                    )}
                    {typeof subject.topPercent === "number" && typeof subject.classSize === "number" && subject.classSize >= 3 && (
                      <div
                        className={`bg-secondary/40 rounded-lg p-2 flex items-center justify-between border ${standingStyles(subject.topPercent).border}`}
                      >
                        <p className="text-xs text-muted-foreground">Standing</p>
                        <p className={`text-xs font-semibold ${standingStyles(subject.topPercent).color}`}>
                          Top {Math.max(1, Math.round(subject.topPercent))}%
                        </p>
                      </div>
                    )}
                    {subject.components.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No mark components stored for this subject yet.</p>
                    ) : (
                      subject.components.map((c) => (
                        <div key={c.id} className="bg-secondary/40 rounded-lg p-2 flex items-center justify-between">
                          <p className="text-xs text-muted-foreground">{c.name}</p>
                          <p className="text-xs font-semibold text-foreground">
                            {c.obtained}/{c.total}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}
