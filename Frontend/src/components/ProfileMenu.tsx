import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  User,
  Dumbbell,
  Utensils,
  GraduationCap,
  Calendar,
  LogOut,
  X,
  ChevronRight
} from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { clearSession, getApiBaseUrl, getSessionUser } from "@/lib/api";

interface ProfileMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

const menuItems = [
  { icon: User, label: "Profile", path: "/profile" },
  { icon: GraduationCap, label: "Academic History", path: "/history/academic" },
  { icon: Dumbbell, label: "Workout History", path: "/history/workout" },
  { icon: Utensils, label: "Nutrition History", path: "/history/nutrition" },
];

export function ProfileMenu({ isOpen, onClose }: ProfileMenuProps) {
  const navigate = useNavigate();
  const sessionUser = getSessionUser();
  const rawProfileImage = String(sessionUser?.profileImageUrl || "").trim();
  const profileImageUrl = rawProfileImage.startsWith("/")
    ? `${getApiBaseUrl()}${rawProfileImage}`
    : rawProfileImage || null;

  const handleNavigation = (path: string) => {
    navigate(path);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Menu Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-[280px] glass-card-elevated z-50 border-l border-white/10 rounded-l-3xl"
          >
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="p-4 border-b border-white/10">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-foreground">Menu</h2>
                  <button
                    onClick={onClose}
                    className="p-2 rounded-full hover:bg-secondary transition-colors"
                  >
                    <X className="h-5 w-5 text-muted-foreground" />
                  </button>
                </div>
                
                {/* User Info */}
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
                    {profileImageUrl ? (
                      <img
                        src={profileImageUrl}
                        alt={sessionUser.fullName || "User"}
                        className="h-12 w-12 rounded-full object-cover"
                      />
                    ) : (
                      <User className="h-6 w-6 text-primary" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{sessionUser?.fullName || "User"}</p>
                    <p className="text-xs text-muted-foreground">{sessionUser?.email || "-"}</p>
                  </div>
                </div>
              </div>

              {/* Menu Items */}
              <div className="flex-1 p-3 space-y-1 overflow-y-auto">
                {menuItems.map((item, index) => (
                  <motion.button
                    key={item.label}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => handleNavigation(item.path)}
                    className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-secondary/50 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                      <span className="text-sm text-foreground">{item.label}</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </motion.button>
                ))}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-white/10 space-y-3">
                {/* Theme Toggle */}
                <div className="flex items-center justify-between p-2">
                  <span className="text-sm text-muted-foreground">Theme</span>
                  <ThemeToggle />
                </div>

                {/* Logout */}
                <button
                  onClick={() => {
                    clearSession();
                    navigate("/auth?mode=signin");
                    onClose();
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl text-critical hover:bg-critical/10 transition-colors"
                >
                  <LogOut className="h-5 w-5" />
                  <span className="text-sm font-medium">Log Out</span>
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
