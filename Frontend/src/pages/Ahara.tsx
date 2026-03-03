import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Utensils,
  ArrowLeft,
  Camera,
  Plus,
  Beef,
  Wheat,
  Droplets,
  Sparkles,
  AlertTriangle,
  Menu,
  Apple,
  Candy,
  FlaskConical,
  ImagePlus
} from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { ProfileMenu } from "@/components/ProfileMenu";
import { FoodImageLogger } from "@/components/FoodImageLogger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SwipeContainer } from "@/components/SwipeContainer";
import { apiRequest, getSessionUser } from "@/lib/api";
import { getLocalDateISO } from "@/lib/date";

type DailyNutrition = {
  date: string;
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFats: number;
};

type MealRow = {
  name: string;
  time: string;
  calories: number;
  items: string;
};

type MealsResponse = {
  date: string;
  meals: MealRow[];
};

const DEFAULT_GOALS = {
  calories: 2000,
  protein: 120,
  carbs: 250,
  fats: 65
};

const Ahara = () => {
  const navigate = useNavigate();
  const user = getSessionUser();

  const [menuOpen, setMenuOpen] = useState(false);
  const [foodLoggerOpen, setFoodLoggerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [date, setDate] = useState(getLocalDateISO());
  const [summary, setSummary] = useState<DailyNutrition | null>(null);
  const [meals, setMeals] = useState<MealRow[]>([]);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError("");
      const [summaryResp, mealsResp] = await Promise.all([
        apiRequest<DailyNutrition>(`/api/nutrition/food/daily/${user.userId}?date=${date}`),
        apiRequest<MealsResponse>(`/api/nutrition/food/meals/${user.userId}?date=${date}`).catch(() => ({ date, meals: [] }))
      ]);
      setSummary(summaryResp);
      setMeals(mealsResp.meals || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load nutrition summary");
    } finally {
      setLoading(false);
    }
  }, [date, user]);

  useEffect(() => {
    if (!user) {
      navigate("/auth?mode=signin");
      return;
    }
    void load();
  }, [load, navigate, user]);

  if (!user) return null;

  const calories = Number(summary?.totalCalories ?? 0);
  const protein = Number(summary?.totalProtein ?? 0);
  const carbs = Number(summary?.totalCarbs ?? 0);
  const fats = Number(summary?.totalFats ?? 0);

  const caloriePercentage = Math.min((calories / DEFAULT_GOALS.calories) * 100, 100);
  const remaining = Math.max(0, DEFAULT_GOALS.calories - calories);
  const hasNutritionData = calories > 0;

  const proteinAlert = protein < 40 && calories > 0;
  const aiInsight =
    calories === 0
      ? "Log a meal to compute macros and daily totals."
      : protein < 40
        ? "You're low on protein. Add eggs, paneer, chicken, or dal to your next meal."
        : "Macro logging looks active today. Keep consistency for better weekly insights.";

  const mainMacros = [
    {
      icon: Beef,
      label: "Protein",
      current: protein,
      goal: DEFAULT_GOALS.protein,
      unit: "g",
      color: "text-critical",
      bgColor: "bg-critical/10",
      isLow: protein < 40
    },
    {
      icon: Wheat,
      label: "Carbs",
      current: carbs,
      goal: DEFAULT_GOALS.carbs,
      unit: "g",
      color: "text-ahara",
      bgColor: "bg-ahara/10",
      isLow: false
    },
    {
      icon: Droplets,
      label: "Fats",
      current: fats,
      goal: DEFAULT_GOALS.fats,
      unit: "g",
      color: "text-gyaan",
      bgColor: "bg-gyaan/10",
      isLow: false
    }
  ];

  const dummyScale = Math.max(0.7, Math.min(1.3, calories / DEFAULT_GOALS.calories || 0.7));
  const additionalMacros = [
    {
      icon: Apple,
      label: "Fiber",
      current: hasNutritionData ? Number((18 * dummyScale).toFixed(1)) : null,
      goal: 30,
      unit: "g"
    },
    {
      icon: Candy,
      label: "Sugar",
      current: hasNutritionData ? Number((26 * dummyScale).toFixed(1)) : null,
      goal: 36,
      unit: "g"
    },
    {
      icon: FlaskConical,
      label: "Sodium",
      current: hasNutritionData ? Number((1400 * dummyScale).toFixed(0)) : null,
      goal: 2000,
      unit: "mg"
    }
  ];

  const micronutrients = [
    { name: "Vitamin D", percentage: hasNutritionData ? 38 : null },
    { name: "Iron", percentage: hasNutritionData ? 62 : null },
    { name: "Calcium", percentage: hasNutritionData ? 74 : null },
    { name: "Vitamin B12", percentage: hasNutritionData ? 58 : null }
  ].map((item) => ({
    ...item,
    status:
      item.percentage === null ? null : item.percentage < 50 ? "low" : item.percentage < 70 ? "moderate" : "good"
  }));

  const water = { current: hasNutritionData ? 3 : 0, goal: 8, unit: "glasses" };

  const mealsByName = new Map(meals.map((m) => [m.name, m]));
  const mealOrder = ["Breakfast", "Lunch", "Snack", "Dinner"];
  const mealsDisplay = mealOrder.map((name) => mealsByName.get(name) || { name, time: name === "Dinner" ? "Pending" : "--", calories: 0, items: "Not logged yet" });

  const handleConfirmMeal = async (items: Array<{ name: string; quantity: string; calories: number; protein: number; carbs: number; fats: number }>) => {
    try {
      setError("");
      await apiRequest("/api/nutrition/food/log", {
        method: "POST",
        body: {
          date,
          items: items.map((i) => ({
            name: i.name,
            quantity: Number(i.quantity || 1),
            calories: Number(i.calories || 0),
            protein: Number(i.protein || 0),
            carbs: Number(i.carbs || 0),
            fats: Number(i.fats || 0)
          }))
        }
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log meal");
    }
  };

  return (
    <SwipeContainer>
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/80 border-b border-border/50">
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => navigate("/home")} className="flex items-center gap-2 text-sm text-muted-foreground">
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
                <h1 className="text-xl font-bold text-foreground">Ahara</h1>
                <p className="text-xs text-muted-foreground">Nutrition Tracker</p>
              </div>
            </div>
          </div>
        </header>

        <main className="px-4 py-4 space-y-4">
          {loading && <p className="text-sm text-muted-foreground">Loading nutrition data...</p>}
          {error && <p className="text-sm text-red-500">{error}</p>}

          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="glass-card p-4 border-l-4 border-l-ahara">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm text-muted-foreground">Calories Today</p>
                  <p className="text-3xl font-bold text-ahara">
                    {calories.toFixed(0)}
                    <span className="text-lg font-normal text-muted-foreground"> / {DEFAULT_GOALS.calories}</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Default goal (can be customized later)</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Remaining</p>
                  <p className="text-xl font-semibold text-foreground">{remaining.toFixed(0)}</p>
                </div>
              </div>
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${caloriePercentage}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className="h-full rounded-full bg-ahara"
                />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Log date</p>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-[150px] h-8" />
              </div>
            </div>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <div className={`rounded-lg border-l-4 p-3 ${proteinAlert ? "border-l-critical bg-critical/5" : "border-l-primary bg-secondary/30"}`}>
              <div className="flex items-start gap-2">
                {proteinAlert ? (
                  <AlertTriangle className="h-4 w-4 text-critical mt-0.5 flex-shrink-0" />
                ) : (
                  <Sparkles className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                )}
                <div>
                  <p className="text-xs font-medium text-foreground mb-0.5">{proteinAlert ? "Low Protein Alert" : "Insight"}</p>
                  <p className="text-xs text-muted-foreground">{aiInsight}</p>
                </div>
              </div>
            </div>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <div className="flex gap-2">
              <Button onClick={() => setFoodLoggerOpen(true)} className="flex-1 rounded-xl bg-ahara hover:bg-ahara/90 text-white">
                <Camera className="mr-2 h-4 w-4" />
                Log Food with AI
              </Button>
              <Button onClick={() => setFoodLoggerOpen(true)} variant="outline" className="rounded-xl border-ahara/30 text-ahara hover:bg-ahara/10">
                <ImagePlus className="h-4 w-4" />
              </Button>
            </div>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">Macros</h2>
            <div className="grid grid-cols-3 gap-2">
              {mainMacros.map((macro, index) => {
                const Icon = macro.icon;
                const pct = macro.goal > 0 ? Math.min((macro.current / macro.goal) * 100, 100) : 0;

                return (
                  <motion.div
                    key={macro.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 + index * 0.05 }}
                    className={`glass-card p-3 ${macro.isLow ? "border border-critical/30" : ""}`}
                  >
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${macro.bgColor} mb-2`}>
                      <Icon className={`h-4 w-4 ${macro.color}`} />
                    </div>
                    <p className="text-xs text-muted-foreground">{macro.label}</p>
                    <p className={`text-lg font-bold ${macro.isLow ? "text-critical" : "text-foreground"}`}>
                      {macro.current.toFixed(0)}
                      <span className="text-xs font-normal text-muted-foreground">
                        /{macro.goal}
                        {macro.unit}
                      </span>
                    </p>
                    <div className="mt-1 h-1 rounded-full bg-secondary overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.8, delay: 0.3 + index * 0.05 }}
                        className={`h-full rounded-full ${macro.isLow ? "bg-critical" : "bg-ahara"}`}
                      />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">Additional Nutrients</h2>
            <div className="grid grid-cols-3 gap-2">
              {additionalMacros.map((macro) => {
                const Icon = macro.icon;
                return (
                  <div key={macro.label} className="glass-card p-2.5 text-center">
                    <Icon className="h-4 w-4 text-ahara mx-auto mb-1" />
                    <p className="text-xs text-muted-foreground">{macro.label}</p>
                    <p className="text-sm font-semibold text-foreground">
                      {macro.current === null ? "No data yet" : `${macro.current}${macro.unit}`}
                    </p>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Dummy future-scope estimates. Macros above are DB-backed.</p>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">Micronutrients</h2>
            <div className="glass-card p-4 space-y-3">
              {micronutrients.map((n) => {
                const pct = n.percentage === null ? 0 : Math.max(0, Math.min(100, n.percentage));
                const bar =
                  n.status === null ? "bg-secondary" : n.status === "low" ? "bg-critical" : n.status === "moderate" ? "bg-warning" : "bg-safe";
                const label =
                  n.percentage === null ? "No data yet" : `${Math.round(pct)}%`;

                return (
                  <div key={n.name}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm text-foreground">{n.name}</p>
                      <p className={`text-xs ${n.percentage === null ? "text-muted-foreground" : n.status === "low" ? "text-critical" : n.status === "moderate" ? "text-warning" : "text-safe"}`}>
                        {label}
                      </p>
                    </div>
                    <div className="h-2 rounded-full bg-secondary overflow-hidden">
                      <div className={`h-full ${bar}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground">
                Dummy future-scope micronutrients. Replace with real analysis pipeline later.
              </p>
            </div>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">Hydration</h2>
            <div className="glass-card p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Droplets className="h-4 w-4 text-gyaan" />
                  <p className="text-sm font-medium text-foreground">Water</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {water.current} / {water.goal} {water.unit}
                </p>
              </div>
              <div className="flex gap-1">
                {Array.from({ length: water.goal }).map((_, idx) => (
                  <div
                    key={idx}
                    className={`h-8 flex-1 rounded-md ${idx < water.current ? "bg-gyaan" : "bg-secondary"}`}
                  />
                ))}
              </div>
            </div>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">Today's Meals</h2>
            <div className="space-y-2">
              {mealsDisplay.map((meal) => (
                <div key={meal.name} className="glass-card p-4 flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <p className="font-medium text-foreground">{meal.name}</p>
                      <p className="text-xs text-muted-foreground">{meal.time}</p>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{meal.items}</p>
                  </div>
                  {meal.calories > 0 ? (
                    <p className="text-sm font-semibold text-ahara">{meal.calories}</p>
                  ) : meal.name === "Dinner" ? (
                    <button
                      type="button"
                      onClick={() => setFoodLoggerOpen(true)}
                      className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs text-foreground hover:bg-secondary"
                    >
                      <Plus className="h-4 w-4" />
                      Add
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground">--</span>
                  )}
                </div>
              ))}
            </div>
          </motion.section>
        </main>

        <FoodImageLogger
          isOpen={foodLoggerOpen}
          onClose={() => setFoodLoggerOpen(false)}
          onConfirm={(items) => void handleConfirmMeal(items)}
        />

        <ProfileMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
        <BottomNav />
      </div>
    </SwipeContainer>
  );
};

export default Ahara;
