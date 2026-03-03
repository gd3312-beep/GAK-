import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar as CalendarIcon, X, ToggleLeft, ToggleRight, TrendingDown, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, eachDayOfInterval, startOfDay } from "date-fns";
import { cn } from "@/lib/utils";

export interface AttendancePredictionSubject {
  id: string;
  name: string;
  matchKey: string;
  attended: number;
  conducted: number;
  attendance: number;
}

export interface AttendancePredictionTimetableRow {
  id: string;
  dayOrder: number;
  subjectName: string;
  matchKey?: string;
  dayLabel?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  facultyName?: string | null;
  roomLabel?: string | null;
}

interface Props {
  subjects: AttendancePredictionSubject[];
  timetableRows: AttendancePredictionTimetableRow[];
  isOpen: boolean;
  onClose: () => void;
  anchorDayOrder?: number;
  dayOrders?: number[];
}

function roundTo(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function formatPercent(value: number, places = 1): string {
  if (!Number.isFinite(value)) return "0%";
  return `${roundTo(value, places).toFixed(places)}%`;
}

function fallbackDayOrderForDate(date: Date): number {
  const jsDay = date.getDay(); // 0=Sun
  return jsDay === 0 ? 7 : jsDay;
}

function getDayOrderForDate(date: Date, cycle: number[], anchorDayOrder?: number): number {
  const normalizedCycle = [...new Set(cycle.filter((day) => Number.isFinite(day) && day >= 1 && day <= 7))].sort((a, b) => a - b);
  if (!normalizedCycle.length || !Number.isFinite(anchorDayOrder) || !normalizedCycle.includes(Number(anchorDayOrder))) {
    return fallbackDayOrderForDate(date);
  }
  const anchorDate = new Date();
  anchorDate.setHours(0, 0, 0, 0);
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);
  const dayDiff = Math.round((targetDate.getTime() - anchorDate.getTime()) / (24 * 60 * 60 * 1000));
  const anchorIndex = normalizedCycle.indexOf(Number(anchorDayOrder));
  let index = (anchorIndex + dayDiff) % normalizedCycle.length;
  if (index < 0) {
    index += normalizedCycle.length;
  }
  return normalizedCycle[index];
}

function buildSubjectFrequency(subjects: AttendancePredictionSubject[], timetableRows: AttendancePredictionTimetableRow[]) {
  const result: Record<string, number[]> = {};

  for (const subject of subjects) {
    const rows = timetableRows.filter((row) => (row.matchKey || row.subjectName) === subject.matchKey);
    const days = [...new Set(rows.map((row) => Number(row.dayOrder)).filter((day) => day >= 1 && day <= 7))];
    result[subject.matchKey] = days;
  }

  return result;
}

export function AttendancePrediction({ subjects, timetableRows, isOpen, onClose, anchorDayOrder, dayOrders = [] }: Props) {
  const [fromDate, setFromDate] = useState<Date | undefined>();
  const [toDate, setToDate] = useState<Date | undefined>();
  const [assumeLeaveAll, setAssumeLeaveAll] = useState(true);
  const [selectedClasses, setSelectedClasses] = useState<Record<string, boolean>>({});
  const [predicted, setPredicted] = useState(false);

  const subjectDayFrequency = useMemo(() => buildSubjectFrequency(subjects, timetableRows), [subjects, timetableRows]);

  const scheduledInstances = useMemo(() => {
    if (!fromDate || !toDate) return [];
    // Inclusive leave interval: include classes on both start and end dates.
    const normalizedFrom = startOfDay(fromDate);
    const normalizedTo = startOfDay(toDate);
    const start = normalizedFrom <= normalizedTo ? normalizedFrom : normalizedTo;
    const end = normalizedFrom <= normalizedTo ? normalizedTo : normalizedFrom;
    const dates = eachDayOfInterval({ start, end });
    const out: Array<{
      id: string;
      dateKey: string;
      dateLabel: string;
      dayOrder: number;
      subjectName: string;
      matchKey: string;
      dayLabel: string | null;
      startTime: string | null;
      endTime: string | null;
      roomLabel: string | null;
      facultyName: string | null;
    }> = [];

    for (const date of dates) {
      const dayOrder = getDayOrderForDate(date, dayOrders, anchorDayOrder);
      const dateKey = format(date, "yyyy-MM-dd");
      const dateLabel = format(date, "EEE, MMM d");
      for (const row of timetableRows.filter((item) => Number(item.dayOrder) === dayOrder)) {
        out.push({
          id: `${dateKey}-${row.id}`,
          dateKey,
          dateLabel,
          dayOrder,
          subjectName: row.subjectName,
          matchKey: row.matchKey || row.subjectName,
          dayLabel: row.dayLabel || null,
          startTime: row.startTime || null,
          endTime: row.endTime || null,
          roomLabel: row.roomLabel || null,
          facultyName: row.facultyName || null
        });
      }
    }

    return out.sort((a, b) => {
      const keyA = `${a.dateKey}|${String(a.startTime || "")}|${a.subjectName}`;
      const keyB = `${b.dateKey}|${String(b.startTime || "")}|${b.subjectName}`;
      return keyA.localeCompare(keyB);
    });
  }, [anchorDayOrder, dayOrders, fromDate, toDate, timetableRows]);

  const selectedClassIds = useMemo(() => {
    if (assumeLeaveAll) {
      return new Set(scheduledInstances.map((item) => item.id));
    }
    return new Set(
      scheduledInstances
        .filter((item) => (
          Object.prototype.hasOwnProperty.call(selectedClasses, item.id)
            ? Boolean(selectedClasses[item.id])
            : true
        ))
        .map((item) => item.id)
    );
  }, [assumeLeaveAll, scheduledInstances, selectedClasses]);

  const predictions = useMemo(() => {
    if (!fromDate || !toDate || !predicted) return null;
    const instancesBySubject = new Map<string, number>();
    for (const item of scheduledInstances) {
      if (!selectedClassIds.has(item.id)) continue;
      const key = item.matchKey || item.subjectName;
      instancesBySubject.set(key, Number(instancesBySubject.get(key) || 0) + 1);
    }

    return subjects.map((subject) => {
      const freq = subjectDayFrequency[subject.matchKey] || [];
      const byDirectName = Number(instancesBySubject.get(subject.matchKey) || 0);
      const fallbackCount = byDirectName > 0
        ? byDirectName
        : (
          assumeLeaveAll
            ? scheduledInstances.filter((item) => freq.includes(item.dayOrder) && (item.matchKey || item.subjectName) === subject.matchKey).length
            : 0
        );
      const missedClasses = fallbackCount;

      const newConducted = subject.conducted + missedClasses;
      const currentAttendance = roundTo(Number(subject.attendance || 0), 2);
      const newAttendance = newConducted > 0
        ? roundTo((subject.attended / newConducted) * 100, 2)
        : currentAttendance;
      const status = newAttendance >= 75 ? "safe" : newAttendance >= 65 ? "warning" : "critical";
      const rawDelta = roundTo(newAttendance - currentAttendance, 2);
      const delta = Math.abs(rawDelta) < 0.05 ? 0 : rawDelta;

      return {
        ...subject,
        missedClasses,
        predictedAttendance: newAttendance,
        predictedStatus: status,
        delta,
        insight:
          missedClasses === 0
            ? "No classes affected"
            : delta === 0
              ? "You remain above 75%"
              : `Skipping drops attendance to ${formatPercent(newAttendance)}`
      };
    });
  }, [fromDate, toDate, predicted, assumeLeaveAll, subjects, subjectDayFrequency, scheduledInstances, selectedClassIds]);

  const handlePredict = () => {
    if (fromDate && toDate) {
      setPredicted(true);
    }
  };

  const handleClose = () => {
    setPredicted(false);
    setFromDate(undefined);
    setToDate(undefined);
    setSelectedClasses({});
    onClose();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "safe":
        return <CheckCircle className="h-4 w-4 text-safe" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-warning" />;
      case "critical":
        return <XCircle className="h-4 w-4 text-critical" />;
      default:
        return null;
    }
  };

  const boundaryDateKeys = useMemo(() => {
    if (!fromDate || !toDate) return new Set<string>();
    return new Set([
      format(startOfDay(fromDate), "yyyy-MM-dd"),
      format(startOfDay(toDate), "yyyy-MM-dd")
    ]);
  }, [fromDate, toDate]);

  const toggleableInstances = useMemo(() => {
    if (!boundaryDateKeys.size) return [];
    return scheduledInstances.filter((row) => boundaryDateKeys.has(row.dateKey));
  }, [boundaryDateKeys, scheduledInstances]);

  const groupedByDate = useMemo(() => {
    const map = new Map<string, typeof scheduledInstances>();
    for (const row of toggleableInstances) {
      const list = map.get(row.dateKey) || [];
      list.push(row);
      map.set(row.dateKey, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [toggleableInstances]);

  useEffect(() => {
    if (assumeLeaveAll) return;
    const allIds = scheduledInstances.map((item) => item.id);
    setSelectedClasses((prev) => {
      const next: Record<string, boolean> = {};
      for (const id of allIds) {
        // Default to selected=true so leave skips all classes unless user unchecks specific ones.
        next[id] = Object.prototype.hasOwnProperty.call(prev, id) ? Boolean(prev[id]) : true;
      }
      return next;
    });
  }, [assumeLeaveAll, scheduledInstances]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl glass-card-elevated border-t border-border/50 p-4 pb-28"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-foreground">Predict Attendance</h3>
            <button onClick={handleClose} className="p-1.5 rounded-full hover:bg-secondary transition-colors">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("justify-start text-left text-xs h-9", !fromDate && "text-muted-foreground")}>
                  <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                  {fromDate ? format(fromDate, "MMM d") : "From"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-[60]" align="start">
                <Calendar
                  mode="single"
                  selected={fromDate}
                  onSelect={(date) => {
                    setFromDate(date);
                    setPredicted(false);
                  }}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("justify-start text-left text-xs h-9", !toDate && "text-muted-foreground")}>
                  <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                  {toDate ? format(toDate, "MMM d") : "To"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-[60]" align="start">
                <Calendar
                  mode="single"
                  selected={toDate}
                  onSelect={(date) => {
                    setToDate(date);
                    setPredicted(false);
                  }}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

	          <button
            onClick={() => {
              setAssumeLeaveAll(!assumeLeaveAll);
              setPredicted(false);
              if (!assumeLeaveAll) {
                setSelectedClasses({});
              }
            }}
            className="flex items-center gap-2 mb-4 text-xs text-muted-foreground"
          >
            {assumeLeaveAll ? <ToggleRight className="h-5 w-5 text-gyaan" /> : <ToggleLeft className="h-5 w-5 text-muted-foreground" />}
            Assume leave for all scheduled classes
          </button>

          {!assumeLeaveAll && fromDate && toDate && (
            <div className="glass-card p-3 mb-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                In-between days are fully skipped by default. Uncheck classes only on the first and last selected days.
              </p>
              <p className="text-xs text-muted-foreground">
                Checked box = leave (miss class). Unchecked box = attending class.
              </p>
              {groupedByDate.length === 0 ? (
                <p className="text-xs text-muted-foreground">No classes found on the first/last selected day.</p>
              ) : (
                groupedByDate.map(([dateKey, rows]) => (
                  <div key={dateKey} className="space-y-1.5">
                    <p className="text-xs font-medium text-foreground">{rows[0]?.dateLabel}</p>
                    {rows.map((row) => (
                      <label key={row.id} className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-3.5 w-3.5 accent-hsl(var(--gyaan))"
                          checked={Boolean(selectedClasses[row.id])}
                          onChange={(event) => {
                            setPredicted(false);
                            setSelectedClasses((prev) => ({ ...prev, [row.id]: event.target.checked }));
                          }}
                        />
                        <span className="leading-5">
                          {row.startTime ? row.startTime.slice(0, 5) : "--:--"}
                          {row.endTime ? `-${row.endTime.slice(0, 5)}` : ""} • {row.subjectName}
                          {row.roomLabel ? ` • ${row.roomLabel}` : ""}
                          {row.facultyName ? ` • ${row.facultyName}` : ""}
                        </span>
                      </label>
                    ))}
                  </div>
                ))
              )}
            </div>
          )}

          {!predicted && (
            <Button onClick={handlePredict} disabled={!fromDate || !toDate} className="w-full rounded-xl bg-gyaan hover:bg-gyaan/90 text-white mb-3" size="sm">
              <TrendingDown className="mr-2 h-4 w-4" /> Run Prediction
            </Button>
          )}

          {predicted && predictions && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
              <p className="text-xs text-muted-foreground mb-2">
                {format(fromDate, "MMM d")} - {format(toDate, "MMM d")} • Read-only simulation
              </p>
              {predictions.map((item) => (
                <div key={item.id} className="glass-card p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium text-foreground">{item.name}</h4>
                      {getStatusIcon(item.predictedStatus)}
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-bold ${
                          item.predictedStatus === "safe" ? "text-safe" : item.predictedStatus === "warning" ? "text-warning" : "text-critical"
                        }`}
                      >
                        {formatPercent(item.predictedAttendance)}
                      </span>
                      {item.delta < 0 && <span className="text-xs text-critical">({formatPercent(item.delta)})</span>}
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary overflow-hidden mb-1">
                    <div
                      className={`h-full rounded-full transition-all ${
                        item.predictedStatus === "safe" ? "bg-safe" : item.predictedStatus === "warning" ? "bg-warning" : "bg-critical"
                      }`}
                      style={{ width: `${item.predictedAttendance}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {item.missedClasses > 0 ? `${item.missedClasses} classes missed • ` : ""}
                    {item.insight}
                  </p>
                </div>
              ))}
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
