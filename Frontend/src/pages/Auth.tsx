import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Mail, Lock, User, ArrowLeft, Activity, BookOpen, Calendar, Dumbbell, Target, ChevronRight } from "lucide-react";
import authBackground from "@/assets/auth-background.jpg";
import { apiRequest, setSession } from "@/lib/api";

type AuthMode = "signin" | "signup";
type OnboardingStep = "integrations" | "workout" | "goals" | null;

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isStrongPassword = (value: string) => value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value);

const Auth = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState<AuthMode>("signup");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [planMessage, setPlanMessage] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    name: ""
  });

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("mode") === "signin") {
      setMode("signin");
    }
  }, [location]);

  const title = useMemo(() => (mode === "signin" ? "Welcome back" : "Create account"), [mode]);
  const subtitle = useMemo(
    () => (mode === "signin" ? "Sign in to continue your journey" : "Start optimizing your student life"),
    [mode]
  );

  const validate = (): string | null => {
    const cleanEmail = formData.email.trim().toLowerCase();
    if (mode === "signup" && formData.name.trim().length < 2) return "Full name must be at least 2 characters";
    if (!emailRegex.test(cleanEmail)) return "Enter a valid email";
    if (mode === "signup" && !isStrongPassword(formData.password)) return "Password must be 8+ chars with letters and numbers";
    if (mode === "signin" && formData.password.trim().length === 0) return "Enter your password";
    return null;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSkipOnboarding = () => {
    navigate("/home");
  };

  const handleNextStep = () => {
    if (onboardingStep === "integrations") {
      setOnboardingStep("workout");
    } else if (onboardingStep === "workout") {
      setOnboardingStep("goals");
    } else {
      navigate("/home");
    }
  };

  const uploadWorkoutPlan = async (file: File) => {
    try {
      setError("");
      setPlanMessage(null);
      setPlanBusy(true);
      const form = new FormData();
      form.append("file", file);
      const resp = await apiRequest<{ planId: string; planName: string | null; exerciseCount: number }>("/api/fitness/plan/upload", {
        method: "POST",
        body: form
      });
      setPlanMessage(`Uploaded: ${resp.planName || "Workout Plan"} (${resp.exerciseCount} exercises)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload workout plan");
    } finally {
      setPlanBusy(false);
    }
  };

  const connectGoogle = async (purpose: "calendar_gmail" | "fit" | "all" = "all") => {
    try {
      setError("");
      const resp = await apiRequest<{ authUrl: string }>(`/api/integrations/google/auth-url?purpose=${encodeURIComponent(purpose)}`);
      window.location.href = resp.authUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start Google OAuth");
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError("");

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    const cleanEmail = formData.email.trim().toLowerCase();
    const password = formData.password;

    try {
      setLoading(true);

      if (mode === "signup") {
        await apiRequest("/api/users/register", {
          method: "POST",
          auth: false,
          body: {
            fullName: formData.name.trim(),
            email: cleanEmail,
            password
          }
        });
      }

      const loginResp = await apiRequest<{ token: string; user: { userId: string; fullName: string; email: string; profileImageUrl?: string | null } }>(
        "/api/users/login",
        {
          method: "POST",
          auth: false,
          body: {
            email: cleanEmail,
            password
          }
        }
      );

      setSession(loginResp.token, loginResp.user);

      if (mode === "signin") {
        navigate("/home");
      } else {
        setShowOnboarding(true);
        setOnboardingStep("integrations");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  if (showOnboarding) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-background">
        <div className="absolute inset-0">
          <img src={authBackground} alt="Background" className="h-full w-full object-cover opacity-20" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/90 to-background" />
        </div>

        <div className="relative z-10 flex min-h-screen flex-col px-6 py-8">
          <div className="flex justify-center gap-2 mb-8">
            {["integrations", "workout", "goals"].map((step, index) => (
              <div
                key={step}
                className={`h-1.5 w-8 rounded-full transition-colors ${
                  ["integrations", "workout", "goals"].indexOf(onboardingStep || "") >= index ? "bg-gak" : "bg-secondary"
                }`}
              />
            ))}
          </div>

          {error && <p className="text-sm text-red-500 text-center mb-4">{error}</p>}

          <AnimatePresence mode="wait">
            {onboardingStep === "integrations" && (
              <motion.div
                key="integrations"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="text-center mb-6">
                  <h2 className="text-xl font-bold text-foreground mb-2">Connect Your Apps</h2>
                  <p className="text-sm text-muted-foreground">Sync data for personalized insights</p>
                </div>

                {[
                  { icon: Calendar, name: "Google Calendar", benefit: "Sync your schedule", onConnect: () => void connectGoogle("calendar_gmail") },
                  { icon: Activity, name: "Google Fit", benefit: "Track fitness", onConnect: () => void connectGoogle("fit") },
                  { icon: BookOpen, name: "SRM Academia", benefit: "Import attendance", onConnect: () => navigate("/profile") }
                ].map((int, idx) => (
                  <motion.div
                    key={int.name}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="glass-card p-4 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gak/10">
                        <int.icon className="h-5 w-5 text-gak" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground text-sm">{int.name}</p>
                        <p className="text-xs text-muted-foreground">{int.benefit}</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs rounded-full"
                      type="button"
                      onClick={int.onConnect}
                      disabled={loading}
                    >
                      Connect
                    </Button>
                  </motion.div>
                ))}

                <div className="flex gap-2 pt-4">
                  <Button variant="ghost" onClick={handleSkipOnboarding} className="flex-1 rounded-xl" type="button">
                    Skip
                  </Button>
                  <Button onClick={handleNextStep} className="flex-1 rounded-xl bg-gak hover:bg-gak/90 text-gak-foreground" type="button">
                    Continue <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </motion.div>
            )}

            {onboardingStep === "workout" && (
              <motion.div
                key="workout"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="text-center mb-6">
                  <h2 className="text-xl font-bold text-foreground mb-2">Workout Plan</h2>
                  <p className="text-sm text-muted-foreground">Upload your gym routine</p>
                </div>
                <div className="glass-card p-6 text-center border-2 border-dashed border-border/50">
                  <Dumbbell className="h-10 w-10 text-karma mx-auto mb-3" />
                  <p className="text-sm font-medium text-foreground mb-1">Upload PDF</p>
                  <p className="text-xs text-muted-foreground mb-2">Optional (used in Karma)</p>
                  {planMessage && <p className="text-xs text-safe mb-2">{planMessage}</p>}
                  <label className={`inline-flex items-center justify-center px-4 py-2 rounded-full border border-border/60 text-xs hover:bg-secondary/60 transition-colors cursor-pointer ${planBusy ? "opacity-60 pointer-events-none" : ""}`}>
                    {planBusy ? "Uploading..." : "Choose File"}
                    <input
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadWorkoutPlan(f);
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>
                </div>
                <div className="flex gap-2 pt-4">
                  <Button variant="ghost" onClick={handleSkipOnboarding} className="flex-1 rounded-xl" type="button">
                    Skip
                  </Button>
                  <Button onClick={handleNextStep} className="flex-1 rounded-xl bg-gak hover:bg-gak/90 text-gak-foreground" type="button">
                    Continue <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </motion.div>
            )}

            {onboardingStep === "goals" && (
              <motion.div
                key="goals"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="text-center mb-6">
                  <h2 className="text-xl font-bold text-foreground mb-2">Set Goals</h2>
                  <p className="text-sm text-muted-foreground">Optional - customize experience</p>
                </div>
                {[{ label: "Weight Loss" }, { label: "Muscle Gain" }, { label: "Maintain" }].map((g, idx) => (
                  <motion.button
                    key={g.label}
                    type="button"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="glass-card p-4 w-full flex items-center justify-between hover:bg-secondary/50"
                  >
                    <div className="flex items-center gap-3">
                      <Target className="h-5 w-5 text-karma" />
                      <span className="text-sm text-foreground">{g.label}</span>
                    </div>
                    <div className="w-4 h-4 rounded-full border-2 border-border" />
                  </motion.button>
                ))}
                <div className="flex gap-2 pt-4">
                  <Button variant="ghost" onClick={handleSkipOnboarding} className="flex-1 rounded-xl" type="button">
                    Skip
                  </Button>
                  <Button onClick={() => navigate("/home")} className="flex-1 rounded-xl bg-gak hover:bg-gak/90 text-gak-foreground" type="button">
                    Get Started
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="absolute inset-0">
        <img src={authBackground} alt="Health and wellness background" className="h-full w-full object-cover opacity-20" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/90 to-background" />
      </div>

      <motion.button
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.2 }}
        onClick={() => navigate("/")}
        className="absolute left-4 top-6 z-20 flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
        type="button"
      >
        <ArrowLeft className="h-5 w-5" />
      </motion.button>

      <div className="relative z-10 flex min-h-screen flex-col px-6 py-16">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="flex-1">
          <div className="mb-8">
            <h1 className="mb-2 text-2xl font-bold text-foreground">{title}</h1>
            <p className="text-muted-foreground">{subtitle}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <AnimatePresence mode="wait">
              {mode === "signup" && (
                <motion.div
                  key="name-field"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-sm text-muted-foreground">
                      Full Name
                    </Label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="name"
                        name="name"
                        type="text"
                        placeholder="Your full name"
                        value={formData.name}
                        onChange={handleInputChange}
                        className="h-14 rounded-xl bg-secondary/50 pl-12 text-base border-border/50 focus:border-gak/50"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm text-muted-foreground">
                Email or University ID
              </Label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="student@university.edu"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="h-14 rounded-xl bg-secondary/50 pl-12 text-base border-border/50 focus:border-gak/50"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm text-muted-foreground">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={mode === "signin" ? "Enter your password" : "Create a strong password"}
                  value={formData.password}
                  onChange={handleInputChange}
                  className="h-14 rounded-xl bg-secondary/50 pl-12 pr-12 text-base border-border/50 focus:border-gak/50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              {mode === "signup" && <p className="text-xs text-gak">Minimum 8 characters, include letters and numbers</p>}
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            {mode === "signup" && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-sm text-muted-foreground">
                By signing up, you agree to our <span className="text-gak">Terms of Service</span> and{" "}
                <span className="text-gak">Privacy Policy</span>
              </motion.p>
            )}

            <Button
              disabled={loading}
              size="lg"
              className="w-full rounded-xl bg-gak py-6 text-base font-medium text-gak-foreground hover:bg-gak/90"
              type="submit"
            >
              {loading ? "Please wait..." : mode === "signin" ? "Sign In" : "Create Account"}
            </Button>
          </form>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="space-y-4 pt-8">
          <p className="text-center text-muted-foreground">
            {mode === "signin" ? "Don't have an account?" : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={() => {
                setError("");
                setMode(mode === "signin" ? "signup" : "signin");
              }}
              className="font-medium text-gak hover:text-gak/80 transition-colors"
            >
              {mode === "signin" ? "Sign up" : "Sign in"}
            </button>
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default Auth;
