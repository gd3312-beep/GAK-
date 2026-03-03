import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Home, Utensils, Activity, BookOpen, Calendar } from "lucide-react";

const navItems = [
  { path: "/home", icon: Home, label: "Home" },
  { path: "/gyaan", icon: BookOpen, label: "Gyaan" },
  { path: "/karma", icon: Activity, label: "Karma" },
  { path: "/ahara", icon: Utensils, label: "Ahara" },
  { path: "/planner", icon: Calendar, label: "Plan" },
];

const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-background/95 backdrop-blur-xl">
      <div className="flex items-center justify-around py-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="relative flex flex-col items-center gap-1 px-4 py-2"
            >
              {isActive && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute -top-2 h-1 w-8 rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
              <Icon
                className={`h-5 w-5 transition-colors ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
              />
              <span
                className={`text-xs transition-colors ${
                  isActive ? "text-primary font-medium" : "text-muted-foreground"
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
      {/* Safe area padding for mobile */}
      <div className="h-safe-area-inset-bottom bg-background" />
    </nav>
  );
};

export default BottomNav;
