import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  User,
  Mail,
  GraduationCap,
  Activity,
  Calendar,
  RefreshCw,
  CheckCircle,
  XCircle,
  Menu,
  ChevronRight,
  Settings,
  LogOut,
  BookOpen,
  Dumbbell,
  Utensils,
  Link2
} from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { ProfileMenu } from "@/components/ProfileMenu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest, clearSession, getApiBaseUrl, getSessionUser, updateSessionUser } from "@/lib/api";

type UserProfile = {
  user_id: string;
  full_name: string;
  email: string;
  profile_image_url?: string | null;
  created_at: string;
};

type IntegrationStatus = {
  googleConnected: boolean;
  tokenExpiry: string | null;
  googleAccountCount?: number;
  primaryGoogleAccountId?: string | null;
  fitGoogleAccountId?: string | null;
  fitGoogleAccountEmail?: string | null;
  fitGoogleAccountLocked?: boolean;
  googleAccounts?: Array<{
    accountId: string;
    userId: string;
    googleId: string | null;
    email: string | null;
    name: string | null;
    tokenExpiry: string | null;
    isPrimary: boolean;
    hasFitPermissions?: boolean | null;
    hasCalendarGmailPermissions?: boolean | null;
    createdAt: string | null;
    updatedAt: string | null;
  }>;
  academiaConnected: boolean;
  academiaEmail: string | null;
  academiaLastSyncedAt: string | null;
  academiaLastError: string | null;
};

type BehaviorRange = "month" | "year" | "all";

type BehaviorAnalysisPayload = {
  range: BehaviorRange;
  summary: {
    academic_score_index: number;
    fitness_discipline_index: number;
    nutrition_balance_index: number;
    overall_consistency_index: number;
  } | null;
  behaviorAnalysis?: {
    reasons: Array<{
      id: string;
      domain: "academic" | "fitness" | "nutrition" | "cross_domain";
      title: string;
      description: string;
      evidence: string[];
    }>;
    warnings: Array<{
      id: string;
      domain: "academic" | "fitness" | "nutrition" | "cross_domain";
      text: string;
    }>;
    insights: Array<{
      id: string;
      domain: "academic" | "fitness" | "nutrition" | "cross_domain";
      text: string;
    }>;
  };
};

const historyItems = [
  { id: "academic", name: "Academic History", icon: BookOpen, path: "/history/academic", border: "border-l-gyaan", iconBg: "bg-gyaan/10", iconColor: "text-gyaan" },
  { id: "workout", name: "Workout History", icon: Dumbbell, path: "/history/workout", border: "border-l-karma", iconBg: "bg-karma/10", iconColor: "text-karma" },
  { id: "nutrition", name: "Nutrition History", icon: Utensils, path: "/history/nutrition", border: "border-l-ahara", iconBg: "bg-ahara/10", iconColor: "text-ahara" }
] as const;

const Profile = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getSessionUser();

  const [menuOpen, setMenuOpen] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [academiaDialogOpen, setAcademiaDialogOpen] = useState(false);
  const [academiaEmail, setAcademiaEmail] = useState("");
  const [academiaPassword, setAcademiaPassword] = useState("");
  const [academiaBusy, setAcademiaBusy] = useState(false);
  const [academiaReportsBusy, setAcademiaReportsBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [fitBusy, setFitBusy] = useState(false);
  const [gmailMessage, setGmailMessage] = useState<string | null>(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [planMessage, setPlanMessage] = useState<string | null>(null);
  const [behaviorRange, setBehaviorRange] = useState<BehaviorRange>("month");
  const [behaviorBusy, setBehaviorBusy] = useState(false);
  const [behaviorData, setBehaviorData] = useState<BehaviorAnalysisPayload | null>(null);
  const [profilePhotoBusy, setProfilePhotoBusy] = useState(false);

  const resolveProfileImageUrl = (raw: string | null | undefined) => {
    const value = String(raw || "").trim();
    if (!value) return null;
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith("/")) return `${getApiBaseUrl()}${value}`;
    return value;
  };

  const profileImageUrl = resolveProfileImageUrl(profile?.profile_image_url || user?.profileImageUrl || null);

  const loadProfile = async () => {
    try {
      setError("");
      const [profileResp, statusResp] = await Promise.all([
        apiRequest<UserProfile>("/api/users/me"),
        apiRequest<IntegrationStatus>("/api/integrations/status")
      ]);
      setProfile(profileResp);
      updateSessionUser({ profileImageUrl: profileResp.profile_image_url || null });
      setStatus(statusResp);
      if (statusResp?.academiaEmail) {
        setAcademiaEmail(statusResp.academiaEmail);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile");
    }
  };

  const uploadProfilePhoto = async (file: File) => {
    try {
      setError("");
      setProfilePhotoBusy(true);
      const form = new FormData();
      form.append("photo", file);
      const response = await apiRequest<{ message: string; profile: UserProfile }>("/api/users/me/profile-photo", {
        method: "PATCH",
        body: form
      });
      setProfile(response.profile);
      updateSessionUser({ profileImageUrl: response.profile?.profile_image_url || null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload profile photo");
    } finally {
      setProfilePhotoBusy(false);
    }
  };

  useEffect(() => {
    if (!user) {
      navigate("/auth?mode=signin");
      return;
    }

    const params = new URLSearchParams(location.search);
    const googleState = params.get("google");
    const reason = params.get("reason");
    if (googleState === "connected") {
      setGmailMessage("Google account connected.");
    } else if (googleState === "error") {
      setError(`Google OAuth failed: ${reason || "Unknown error"}`);
    }

    void loadProfile();
  }, [location.search, navigate, user]);

  if (!user) return null;

  const startGoogleOAuth = async (purpose: "calendar_gmail" | "fit" | "all" = "all") => {
    try {
      setError("");
      setGmailMessage(null);
      setGoogleBusy(true);
      const resp = await apiRequest<{ authUrl: string }>(`/api/integrations/google/auth-url?purpose=${encodeURIComponent(purpose)}`);
      window.location.href = resp.authUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start Google OAuth");
      setGoogleBusy(false);
    }
  };

  const parseGmail = async () => {
    try {
      setError("");
      setGmailMessage(null);
      const result = await apiRequest<{
        processed: number;
        createdEvents: number;
        accountCount?: number;
        accounts?: Array<{ email: string | null; processed: number; createdEvents: number; status: string; error: string | null }>;
      }>("/api/integrations/gmail/parse", { method: "POST" });

      const accounts = Array.isArray(result.accounts) ? result.accounts : [];
      const problems = accounts.filter((a) => a.status !== "ok");
      const summary = `Parsed ${result.processed} emails, created ${result.createdEvents} events${result.accountCount ? ` across ${result.accountCount} accounts` : ""}.`;
      const details =
        problems.length > 0
          ? ` Issues: ${problems
              .slice(0, 3)
              .map((a) => `${a.email || "account"} (${a.status}): ${a.error || "unknown error"}`)
              .join(" | ")}`
          : "";
      setGmailMessage(`${summary}${details}`);
      const statusResp = await apiRequest<IntegrationStatus>("/api/integrations/status");
      setStatus(statusResp);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse Gmail");
    }
  };

  const setPrimaryGoogle = async (accountId: string) => {
    try {
      setError("");
      await apiRequest(`/api/integrations/google/accounts/${encodeURIComponent(accountId)}/primary`, { method: "POST" });
      const statusResp = await apiRequest<IntegrationStatus>("/api/integrations/status");
      setStatus(statusResp);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set primary Google account");
    }
  };

  const setFitGoogle = async (accountId: string) => {
    try {
      setError("");
      setGmailMessage(null);
      setFitBusy(true);
      const payload = await apiRequest<IntegrationStatus>("/api/integrations/fit/account", {
        method: "POST",
        body: { accountId }
      });
      setStatus((prev) => ({ ...(prev || {}), ...payload }));
      setGmailMessage("Google Fit account locked. This selection is one-time.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to lock Google Fit account");
    } finally {
      setFitBusy(false);
    }
  };

  const connectAcademia = async () => {
    try {
      setError("");
      setAcademiaBusy(true);
      await apiRequest("/api/integrations/academia/connect", {
        method: "POST",
        body: {
          collegeEmail: academiaEmail,
          collegePassword: academiaPassword
        }
      });
      setAcademiaDialogOpen(false);
      setAcademiaPassword("");
      await loadProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect SRM Academia");
    } finally {
      setAcademiaBusy(false);
    }
  };

  const syncAcademia = async () => {
    try {
      setError("");
      setAcademiaBusy(true);
      await apiRequest("/api/integrations/academia/sync", { method: "POST" });
      await loadProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync SRM Academia");
    } finally {
      setAcademiaBusy(false);
    }
  };

  const syncAcademiaReports = async () => {
    try {
      setError("");
      setAcademiaReportsBusy(true);
      await apiRequest("/api/integrations/academia/sync-reports", { method: "POST" });
      await loadProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync SRM academic reports");
    } finally {
      setAcademiaReportsBusy(false);
    }
  };

  const uploadPlan = async (file: File) => {
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

  const loadBehaviorAnalysis = async () => {
    try {
      setError("");
      setBehaviorBusy(true);
      const resp = await apiRequest<BehaviorAnalysisPayload>(`/api/advanced-analytics/behavior-summary?range=${behaviorRange}`);
      setBehaviorData(resp);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load behavior analysis");
    } finally {
      setBehaviorBusy(false);
    }
  };

  const googleAccounts = status?.googleAccounts || [];
  const primaryGoogleAccount = googleAccounts.find((item) => item.isPrimary) || googleAccounts[0] || null;
  const googleAccountCount = status?.googleAccountCount ?? googleAccounts.length;
  const googleConnected = Boolean(status?.googleConnected);
  const fitLocked = Boolean(status?.fitGoogleAccountLocked);
  const googleSummary = googleConnected
    ? `${googleAccountCount} account${googleAccountCount === 1 ? "" : "s"}${primaryGoogleAccount?.email ? ` • primary ${primaryGoogleAccount.email}` : ""}`
    : "Not connected";
  const fitSummary = fitLocked
    ? `Locked to ${status?.fitGoogleAccountEmail || "selected account"}`
    : googleConnected
      ? "Choose one linked account once for Fit"
      : "Connect Google account first";

  const integrations = [
    {
      id: "calendar",
      name: "Google Calendar",
      icon: Calendar,
      connected: googleConnected,
      lastSync: googleConnected ? googleSummary : null,
      border: "border-l-gyaan",
      iconBg: "bg-gyaan/10",
      iconColor: "text-gyaan"
    },
    {
      id: "googlefit",
      name: "Google Fit",
      icon: Activity,
      connected: fitLocked,
      lastSync: fitSummary,
      border: "border-l-karma",
      iconBg: "bg-karma/10",
      iconColor: "text-karma"
    },
    {
      id: "gmail",
      name: "Gmail Parsing",
      icon: GraduationCap,
      connected: googleConnected,
      lastSync: googleConnected ? googleSummary : null,
      border: "border-l-ahara",
      iconBg: "bg-ahara/10",
      iconColor: "text-ahara"
    }
  ];

  const insightBorder = (domain: string) => {
    if (domain === "academic") return "border-l-gyaan";
    if (domain === "fitness") return "border-l-karma";
    if (domain === "nutrition") return "border-l-ahara";
    return "border-l-gak";
  };

  return (
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
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gak/10">
              <User className="h-5 w-5 text-gak" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Profile</h1>
              <p className="text-xs text-muted-foreground">Account & Integrations</p>
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 py-4 space-y-6">
        {error && <p className="text-sm text-red-500">{error}</p>}
        {gmailMessage && <p className="text-sm text-safe">{gmailMessage}</p>}

        <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="glass-card p-4">
            <div className="flex items-center gap-4 mb-4">
              <div className="relative">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gak/20 overflow-hidden">
                  {profileImageUrl ? (
                    <img src={profileImageUrl} alt={profile?.full_name || user.fullName} className="h-16 w-16 object-cover" />
                  ) : (
                    <User className="h-8 w-8 text-gak" />
                  )}
                </div>
                <label
                  className={`absolute -bottom-1 -right-1 inline-flex items-center justify-center h-7 w-7 rounded-full bg-gak text-gak-foreground text-xs border border-background ${profilePhotoBusy ? "opacity-60 pointer-events-none" : "cursor-pointer"}`}
                  title="Upload profile photo"
                >
                  +
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadProfilePhoto(file);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">{profile?.full_name || user.fullName}</h2>
                <p className="text-sm text-muted-foreground">User ID: {profile?.user_id?.slice(0, 12) || "-"}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{profilePhotoBusy ? "Uploading photo..." : "Tap + to change photo"}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3 p-2 rounded-lg bg-secondary/30">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-foreground">{profile?.email || user.email}</span>
              </div>
              <div className="flex items-center gap-3 p-2 rounded-lg bg-secondary/30">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-foreground">Created: {profile ? new Date(profile.created_at).toLocaleString() : "-"}</span>
              </div>
            </div>
          </div>
        </motion.section>

        <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className="glass-card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Settings className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium text-foreground">Theme</span>
              </div>
              <ThemeToggle />
            </div>
          </div>
        </motion.section>

        <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wide">Integrations</h2>
          <div className="space-y-2">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18 }}
              className="glass-card p-4 border-l-4 border-l-gyaan"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gyaan/10">
                    <GraduationCap className="h-5 w-5 text-gyaan" />
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground">SRM Academia</h3>
                    {status?.academiaConnected ? (
                      <p className="text-xs text-muted-foreground">
                        Connected{status.academiaEmail ? ` • ${status.academiaEmail}` : ""}{status.academiaLastSyncedAt ? ` • Synced ${new Date(status.academiaLastSyncedAt).toLocaleString()}` : ""}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Import attendance, timetable, and marks</p>
                    )}
                    {status?.academiaLastError && <p className="text-xs text-critical mt-1">{status.academiaLastError}</p>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={status?.academiaConnected ? "outline" : "default"}
                    onClick={() => setAcademiaDialogOpen(true)}
                    className="text-xs gap-1"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    {status?.academiaConnected ? "Update" : "Connect"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void syncAcademia()}
                    className="text-xs gap-1"
                    disabled={!status?.academiaConnected || academiaBusy}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Sync Marks+Attendance
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void syncAcademiaReports()}
                    className="text-xs gap-1"
                    disabled={!status?.academiaConnected || academiaReportsBusy}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    {academiaReportsBusy ? "Syncing..." : "Sync Reports"}
                  </Button>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.19 }}
              className="glass-card p-4 border-l-4 border-l-gak"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-foreground">Google Accounts</h3>
                  <p className="text-xs text-muted-foreground">
                    {googleConnected ? googleSummary : "Connect one or more Google accounts for Calendar, Gmail, and Fit"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void startGoogleOAuth("calendar_gmail")}
                  className="text-xs gap-1"
                  disabled={googleBusy}
                >
                  <Link2 className="h-3.5 w-3.5" />
                  {googleBusy ? "Connecting..." : googleConnected ? "Add Account" : "Connect"}
                </Button>
              </div>
            </motion.div>

            {integrations.map((integration, index) => {
              const Icon = integration.icon;
              return (
                <motion.div
                  key={integration.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + index * 0.05 }}
                  className={`glass-card p-4 border-l-4 ${integration.border}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${integration.iconBg}`}>
                        <Icon className={`h-5 w-5 ${integration.iconColor}`} />
                      </div>
                      <div>
                        <h3 className="font-medium text-foreground">{integration.name}</h3>
                        {integration.connected ? (
                          <div className="flex items-center gap-1 text-xs text-safe">
                            <CheckCircle className="h-3 w-3" />
                            <span>Connected {integration.lastSync ? `• ${integration.lastSync}` : ""}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <XCircle className="h-3 w-3" />
                            <span>Not connected</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={integration.connected ? "outline" : "default"}
                      onClick={() => {
                        if (!integration.connected) {
                          if (integration.id === "googlefit" && googleConnected) {
                            const accounts = (status?.googleAccounts || []) as Array<{ hasFitPermissions?: boolean | null }>;
                            const anyFitOk = accounts.some((a) => a.hasFitPermissions === true);
                            if (!anyFitOk) {
                              // They connected Google for Calendar/Gmail but never granted Fit scopes.
                              void startGoogleOAuth("fit");
                              return;
                            }
                            setError("Choose a linked Google account for Fit below (one-time).");
                          } else {
                            const purpose =
                              integration.id === "googlecalendar" || integration.id === "gmail"
                                ? "calendar_gmail"
                                : integration.id === "googlefit"
                                  ? "fit"
                                  : "all";
                            void startGoogleOAuth(purpose);
                          }
                        } else if (integration.id === "gmail") {
                          void parseGmail();
                        } else if (integration.id === "googlefit") {
                          navigate("/karma");
                        } else {
                          navigate("/planner");
                        }
                      }}
                      className="text-xs gap-1"
                      disabled={googleBusy}
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      {integration.connected ? (integration.id === "gmail" ? "Parse" : "Open") : (integration.id === "googlefit" && googleConnected ? "Choose" : "Connect")}
                    </Button>
                  </div>
                </motion.div>
              );
            })}

            {googleAccounts.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="glass-card p-4 border-l-4 border-l-gak"
              >
                <h3 className="font-medium text-foreground mb-2">Linked Google Accounts</h3>
                <div className="space-y-2">
                  {googleAccounts.map((account) => (
                    <div key={account.accountId} className="flex items-center justify-between rounded-lg bg-secondary/30 p-2">
                      <div className="min-w-0">
                        <p className="text-sm text-foreground truncate">{account.email || account.googleId || account.accountId}</p>
                        <p className="text-xs text-muted-foreground">
                          {account.accountId === status?.fitGoogleAccountId ? "Google Fit account (locked)" : account.isPrimary ? "Primary account" : "Secondary account"}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {!account.isPrimary && (
                          <Button size="sm" variant="outline" className="text-xs" onClick={() => void setPrimaryGoogle(account.accountId)}>
                            Make Primary
                          </Button>
                        )}
                        {!fitLocked && (
                          <Button
                            size="sm"
                            className="text-xs"
                            onClick={() => {
                              if (account.hasFitPermissions === false) {
                                setError("That Google account is not authorized for Google Fit yet. Connect it using the Google Fit connect flow first (Karma -> Connect).");
                                return;
                              }
                              void setFitGoogle(account.accountId);
                            }}
                            disabled={fitBusy || account.hasFitPermissions === false}
                          >
                            {fitBusy ? "Saving..." : "Use for Fit"}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </div>
        </motion.section>

        <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wide">Workout Plan</h2>
          <div className="glass-card p-4 border-l-4 border-l-karma">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-foreground">Upload PDF</p>
                <p className="text-xs text-muted-foreground">Used in Karma to show today&apos;s workout (no manual logging).</p>
                {planMessage && <p className="text-xs text-safe mt-1">{planMessage}</p>}
              </div>
              <label className={`text-xs px-3 py-2 rounded-lg border border-border/60 hover:bg-secondary/60 transition-colors cursor-pointer ${planBusy ? "opacity-60 pointer-events-none" : ""}`}>
                {planBusy ? "Uploading..." : "Choose File"}
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadPlan(f);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
          </div>
        </motion.section>

        <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wide">History</h2>
          <div className="space-y-2">
            {historyItems.map((item, index) => {
              const Icon = item.icon;
              return (
                <motion.button
                  key={item.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + index * 0.05 }}
                  onClick={() => navigate(item.path)}
                  className={`w-full glass-card p-4 flex items-center justify-between border-l-4 ${item.border}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.iconBg}`}>
                      <Icon className={`h-5 w-5 ${item.iconColor}`} />
                    </div>
                    <span className="font-medium text-foreground">{item.name}</span>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </motion.button>
              );
            })}
          </div>
        </motion.section>

        <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wide">Behavior Analysis</h2>
          <div className="space-y-2">
            <div className="glass-card p-4 border-l-4 border-l-gak">
              <div className="flex items-center gap-2 mb-3">
                <Button
                  size="sm"
                  variant={behaviorRange === "month" ? "default" : "outline"}
                  className={`text-xs rounded-full ${behaviorRange === "month" ? "bg-gak hover:bg-gak/90 text-gak-foreground" : ""}`}
                  onClick={() => setBehaviorRange("month")}
                >
                  Month
                </Button>
                <Button
                  size="sm"
                  variant={behaviorRange === "year" ? "default" : "outline"}
                  className={`text-xs rounded-full ${behaviorRange === "year" ? "bg-gak hover:bg-gak/90 text-gak-foreground" : ""}`}
                  onClick={() => setBehaviorRange("year")}
                >
                  Year
                </Button>
                <Button
                  size="sm"
                  variant={behaviorRange === "all" ? "default" : "outline"}
                  className={`text-xs rounded-full ${behaviorRange === "all" ? "bg-gak hover:bg-gak/90 text-gak-foreground" : ""}`}
                  onClick={() => setBehaviorRange("all")}
                >
                  All Time
                </Button>
                <Button size="sm" className="text-xs ml-auto" onClick={() => void loadBehaviorAnalysis()} disabled={behaviorBusy}>
                  {behaviorBusy ? "Analyzing..." : "Get Analysis"}
                </Button>
              </div>

              {behaviorData?.summary ? (
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="rounded-lg bg-secondary/30 p-2 text-center">
                    <p className="text-xs text-muted-foreground">Gyaan</p>
                    <p className="text-sm font-semibold text-foreground">{Math.round(Number(behaviorData.summary.academic_score_index || 0))}%</p>
                  </div>
                  <div className="rounded-lg bg-secondary/30 p-2 text-center">
                    <p className="text-xs text-muted-foreground">Karma</p>
                    <p className="text-sm font-semibold text-foreground">{Math.round(Number(behaviorData.summary.fitness_discipline_index || 0))}%</p>
                  </div>
                  <div className="rounded-lg bg-secondary/30 p-2 text-center">
                    <p className="text-xs text-muted-foreground">Ahara</p>
                    <p className="text-sm font-semibold text-foreground">{Math.round(Number(behaviorData.summary.nutrition_balance_index || 0))}%</p>
                  </div>
                  <div className="rounded-lg bg-secondary/30 p-2 text-center">
                    <p className="text-xs text-muted-foreground">Overall</p>
                    <p className="text-sm font-semibold text-foreground">{Math.round(Number(behaviorData.summary.overall_consistency_index || 0))}%</p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mb-3">Run analysis to view combined trends from academics, fitness, and nutrition.</p>
              )}

              <div className="space-y-2">
                {(behaviorData?.behaviorAnalysis?.reasons || []).slice(0, 2).map((item) => (
                  <div key={item.id} className={`rounded-lg bg-secondary/30 p-3 border-l-4 ${insightBorder(item.domain)}`}>
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                  </div>
                ))}
                {(behaviorData?.behaviorAnalysis?.warnings || []).slice(0, 1).map((item) => (
                  <div key={item.id} className={`rounded-lg bg-secondary/30 p-3 border-l-4 ${insightBorder(item.domain)}`}>
                    <p className="text-xs text-foreground">{item.text}</p>
                  </div>
                ))}
                {(behaviorData?.behaviorAnalysis?.insights || []).slice(0, 1).map((item) => (
                  <div key={item.id} className={`rounded-lg bg-secondary/30 p-3 border-l-4 ${insightBorder(item.domain)}`}>
                    <p className="text-xs text-foreground">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.section>

        <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          {showSignOutConfirm ? (
            <div className="glass-card p-4 border border-critical/30">
              <p className="text-sm text-foreground mb-3">Are you sure you want to sign out?</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowSignOutConfirm(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="flex-1 bg-critical hover:bg-critical/90 text-white"
                  onClick={() => {
                    clearSession();
                    navigate("/auth?mode=signin");
                  }}
                >
                  Sign Out
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowSignOutConfirm(true)}
              className="w-full glass-card p-4 flex items-center justify-center gap-2 text-critical hover:bg-critical/5 transition-colors"
            >
              <LogOut className="h-5 w-5" />
              <span className="font-medium">Sign Out</span>
            </button>
          )}
        </motion.section>
      </main>

      <ProfileMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
      <BottomNav />

      <Dialog open={academiaDialogOpen} onOpenChange={setAcademiaDialogOpen}>
        <DialogContent className="glass-card-elevated border border-white/10">
          <DialogHeader>
            <DialogTitle>Connect SRM Academia</DialogTitle>
            <DialogDescription>Credentials are stored encrypted in your local database.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">College Email</p>
              <Input value={academiaEmail} onChange={(e) => setAcademiaEmail(e.target.value)} placeholder="your@srmist.edu.in" />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Password</p>
              <Input type="password" value={academiaPassword} onChange={(e) => setAcademiaPassword(e.target.value)} placeholder="Password" />
            </div>
            <p className="text-xs text-muted-foreground">After connecting, press Sync to import attendance/timetable/marks.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcademiaDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void connectAcademia()} disabled={academiaBusy}>
              {academiaBusy ? "Connecting..." : "Connect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Profile;
