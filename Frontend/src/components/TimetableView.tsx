import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, CheckCircle, AlertTriangle, AlertCircle } from "lucide-react";

export interface TimetableClassItem {
  id: string;
  dayOrder: number;
  dayLabel?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  subjectName: string;
  roomLabel?: string | null;
  facultyName?: string | null;
  priority: "must-attend" | "attend-if-possible" | "safe-to-skip";
}

interface TimetableViewProps {
  currentDayOrder: number;
  dayOrders: number[];
  classes: TimetableClassItem[];
  onDayOrderChange: (dayOrder: number) => void;
}

function getPriorityStyles(priority: TimetableClassItem["priority"]) {
  switch (priority) {
    case "must-attend":
      return {
        border: "border-l-critical",
        bg: "bg-critical/5",
        icon: <AlertCircle className="h-4 w-4 text-critical" />,
        label: "Must Attend",
        labelColor: "text-critical"
      };
    case "attend-if-possible":
      return {
        border: "border-l-warning",
        bg: "bg-warning/5",
        icon: <AlertTriangle className="h-4 w-4 text-warning" />,
        label: "Attend if possible",
        labelColor: "text-warning"
      };
    default:
      return {
        border: "border-l-safe",
        bg: "bg-safe/5",
        icon: <CheckCircle className="h-4 w-4 text-safe" />,
        label: "Safe to skip",
        labelColor: "text-safe"
      };
  }
}

function formatTime(value?: string | null) {
  if (!value) return "--:--";
  return String(value).slice(0, 5);
}

export function TimetableView({ currentDayOrder, dayOrders, classes, onDayOrderChange }: TimetableViewProps) {
  const sortedDays = [...dayOrders].sort((a, b) => a - b);
  const currentIndex = sortedDays.findIndex((day) => day === currentDayOrder);

  const currentClasses = classes
    .filter((row) => row.dayOrder === currentDayOrder)
    .sort((a, b) => String(a.startTime || "").localeCompare(String(b.startTime || "")));

  const prevDay = currentIndex > 0 ? sortedDays[currentIndex - 1] : null;
  const nextDay = currentIndex >= 0 && currentIndex < sortedDays.length - 1 ? sortedDays[currentIndex + 1] : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => prevDay && onDayOrderChange(prevDay)}
            className="p-2 rounded-lg hover:bg-secondary transition-colors disabled:opacity-40"
            disabled={prevDay === null}
          >
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <span className="text-sm font-medium text-foreground">Day Order {currentDayOrder}</span>
          <button
            onClick={() => nextDay && onDayOrderChange(nextDay)}
            className="p-2 rounded-lg hover:bg-secondary transition-colors disabled:opacity-40"
            disabled={nextDay === null}
          >
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {sortedDays.map((day) => (
          <button
            key={day}
            onClick={() => onDayOrderChange(day)}
            className={`min-w-[68px] py-2 rounded-lg text-sm font-medium transition-all ${
              currentDayOrder === day ? "bg-gyaan text-white" : "bg-secondary text-muted-foreground hover:bg-secondary/80"
            }`}
          >
            {day}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {currentClasses.length === 0 ? (
          <div className="glass-card p-3 text-sm text-muted-foreground">No timetable rows for this day order.</div>
        ) : (
          currentClasses.map((classItem, index) => {
            const styles = getPriorityStyles(classItem.priority);

            return (
              <motion.div
                key={classItem.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`glass-card p-3 border-l-4 ${styles.border} ${styles.bg}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-16 text-center flex-shrink-0">
                    <p className="text-sm font-semibold text-foreground">{formatTime(classItem.startTime)}</p>
                    <p className="text-xs text-muted-foreground">{formatTime(classItem.endTime)}</p>
                  </div>

                  <div className="w-px h-10 bg-border" />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium truncate text-foreground">{classItem.subjectName}</h4>
                      {styles.icon}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {classItem.roomLabel || "Room N/A"}
                      {classItem.facultyName ? ` • ${classItem.facultyName}` : ""}
                    </p>
                  </div>

                  <span className={`text-xs font-medium ${styles.labelColor} flex-shrink-0`}>{styles.label}</span>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}

