import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { BookOpen, Activity, Utensils } from "lucide-react";
import authBackground from "@/assets/auth-background.jpg";

const Welcome = () => {
  const navigate = useNavigate();

  const pillars = [
    {
      icon: BookOpen,
      label: "Academics",
      tagline: "Track & Optimize",
      cardClass: "bg-gyaan/10 border border-gyaan/30",
      iconClass: "text-gyaan"
    },
    {
      icon: Activity,
      label: "Fitness",
      tagline: "Move & Grow",
      cardClass: "bg-karma/10 border border-karma/30",
      iconClass: "text-karma"
    },
    {
      icon: Utensils,
      label: "Nutrition",
      tagline: "Fuel & Heal",
      cardClass: "bg-ahara/10 border border-ahara/30",
      iconClass: "text-ahara"
    }
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Background Image with Overlay */}
      <div className="absolute inset-0">
        <img
          src={authBackground}
          alt="Health and wellness background"
          className="h-full w-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/80 to-background" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-between px-6 py-12">
        {/* Top Section - Logo and Title */}
        <div className="flex-1 flex flex-col items-center justify-center">
          {/* Brand Logo - GAK Letters */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="mb-8"
          >
            <div className="relative">
              <div className="absolute inset-0 animate-pulse rounded-full bg-gak/30 blur-xl" />
              <img
                src="/favicon.svg"
                alt="GAK logo"
                className="relative h-20 w-20 rounded-full object-cover"
              />
            </div>
          </motion.div>

          {/* Pillar Icons Row */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="mb-6 flex items-center gap-4"
          >
            {pillars.map((pillar, index) => {
              const Icon = pillar.icon;
              return (
                <motion.div
                  key={pillar.label}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.4 + index * 0.1 }}
                  className={`flex h-14 w-14 items-center justify-center rounded-xl ${pillar.cardClass}`}
                >
                  <Icon className={`h-7 w-7 ${pillar.iconClass}`} />
                </motion.div>
              );
            })}
          </motion.div>

          {/* App Name - GAK Branding */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="mb-2 text-6xl font-bold tracking-tight md:text-7xl"
          >
            <span className="text-gyaan">G</span>
            <span className="text-karma">A</span>
            <span className="text-ahara">K</span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.6 }}
            className="mb-4 text-lg font-medium tracking-wide text-foreground/80"
          >
            <span className="text-gyaan">Gyaan</span>
            <span className="text-muted-foreground"> – </span>
            <span className="text-karma">Karma</span>
            <span className="text-muted-foreground"> – </span>
            <span className="text-ahara">Ahara</span>
          </motion.p>

          {/* Tagline */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7, duration: 0.6 }}
            className="mb-2 text-base text-muted-foreground"
          >
            Your Student Day Assistant for
          </motion.p>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.6 }}
            className="text-base text-muted-foreground"
          >
            Knowledge, Action, and Nutrition
          </motion.p>
        </div>

        {/* Bottom Section - Pillar Cards and CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.6 }}
          className="w-full max-w-lg space-y-4"
        >
          {/* Pillar Cards */}
          <div className="grid grid-cols-3 gap-3">
            {pillars.map((pillar, index) => (
              <motion.div
                key={pillar.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1 + index * 0.1 }}
                className={`rounded-xl border-2 p-4 text-center ${pillar.cardClass}`}
              >
                <p className="text-xs text-muted-foreground mb-1">{pillar.label}</p>
                <p className="text-sm font-medium text-foreground">{pillar.tagline}</p>
              </motion.div>
            ))}
          </div>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.3, duration: 0.6 }}
            className="space-y-3 pt-4"
          >
            <Button
              onClick={() => navigate("/auth")}
              size="lg"
              className="w-full rounded-xl bg-gak py-6 text-base font-medium text-gak-foreground hover:bg-gak/90"
            >
              Get Started
            </Button>
 	    <Button
               onClick={() => navigate("/auth?mode=signin")}
               variant="outline"
               size="lg"
               className="w-full rounded-xl border-border/50 py-6 text-base font-medium"
             >
               I already have an account
             </Button>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
};

export default Welcome;
