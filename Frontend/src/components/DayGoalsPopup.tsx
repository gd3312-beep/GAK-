import { motion, AnimatePresence } from "framer-motion";
import { X, BookOpen, Activity, Utensils, Heart } from "lucide-react";

interface DayGoal {
  type: "gyaan" | "karma" | "ahara" | "personal";
  summary: string;
}

interface DayGoalsPopupProps {
  isOpen: boolean;
  onClose: () => void;
  date: Date | null;
  goals: DayGoal[];
  anchorPosition?: { x: number; y: number };
}

const typeConfig = {
  gyaan: {
    icon: BookOpen,
    color: "text-gyaan",
    bg: "bg-gyaan/10",
    dot: "bg-gyaan",
  },
  karma: {
    icon: Activity,
    color: "text-karma",
    bg: "bg-karma/10",
    dot: "bg-karma",
  },
  ahara: {
    icon: Utensils,
    color: "text-ahara",
    bg: "bg-ahara/10",
    dot: "bg-ahara",
  },
  personal: {
    icon: Heart,
    color: "text-purple-500",
    bg: "bg-purple-500/10",
    dot: "bg-purple-500",
  },
};

export function DayGoalsPopup({ isOpen, onClose, date, goals }: DayGoalsPopupProps) {
  if (!date) return null;

  const formattedDate = date.toLocaleDateString('en-US', { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric' 
  });

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50"
            onClick={onClose}
          />
          
          {/* Popup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            transition={{ type: "spring", damping: 25, stiffness: 400 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[280px] max-w-[90vw]"
          >
            <div className="glass-card-elevated p-4 rounded-2xl">
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground">{formattedDate}</h3>
                <button 
                  onClick={onClose}
                  className="p-1 rounded-full hover:bg-secondary transition-colors"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              {/* Goals */}
              {goals.length > 0 ? (
                <div className="space-y-2">
                  {goals.map((goal, index) => {
                    const config = typeConfig[goal.type];
                    const Icon = config.icon;
                    
                    return (
                      <div 
                        key={index}
                        className="flex items-center gap-2"
                      >
                        <div className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
                        <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                        <span className="text-xs text-foreground truncate">{goal.summary}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-2">
                  No planned goals yet
                </p>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
