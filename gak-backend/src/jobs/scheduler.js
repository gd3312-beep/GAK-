const cron = require("node-cron");

const jobService = require("../services/job.service");

function wrapJob(name, fn) {
  return async () => {
    const startedAt = Date.now();
    try {
      const result = await fn();
      console.log(JSON.stringify({
        type: "job",
        name,
        status: "ok",
        durationMs: Date.now() - startedAt,
        result
      }));
    } catch (error) {
      console.error(JSON.stringify({
        type: "job",
        name,
        status: "error",
        durationMs: Date.now() - startedAt,
        message: String(error?.message || error)
      }));
    }
  };
}

function readCron(name, fallback) {
  const raw = String(process.env[name] || "").trim();
  return raw || fallback;
}

function registerCron(name, expression, fn) {
  if (!cron.validate(expression)) {
    console.error(JSON.stringify({
      type: "job",
      name,
      status: "invalid_cron",
      expression
    }));
    return;
  }
  cron.schedule(expression, wrapJob(name, fn));
}

function bootstrapScheduler() {
  const jobsEnabled = String(process.env.ENABLE_JOBS || "").toLowerCase() === "true";
  if (!jobsEnabled) {
    return;
  }

  const isProduction = String(process.env.NODE_ENV || "").toLowerCase() === "production";
  const allowDevJobs = String(process.env.ENABLE_DEV_JOBS || "").toLowerCase() === "true";
  if (!isProduction && !allowDevJobs) {
    console.log(JSON.stringify({
      type: "job",
      status: "skipped",
      reason: "jobs_disabled_in_dev",
      hint: "Set ENABLE_DEV_JOBS=true to run schedulers locally."
    }));
    return;
  }

  registerCron(
    "gmail-sync",
    readCron("CRON_GMAIL_SYNC", "*/10 * * * *"),
    jobService.runGmailSyncJob
  );

  registerCron(
    "token-refresh",
    readCron("CRON_TOKEN_REFRESH", "0 * * * *"),
    jobService.runTokenRefreshJob
  );

  registerCron(
    "calendar-sync",
    readCron("CRON_CALENDAR_SYNC", "15 * * * *"),
    jobService.runCalendarSyncJob
  );

  registerCron(
    "fitness-sync",
    readCron("CRON_FIT_SYNC", "*/20 * * * *"),
    jobService.runFitnessSyncJob
  );

  registerCron(
    "academic-cleanup",
    readCron("CRON_ACADEMIC_CLEANUP", "5 * * * *"),
    jobService.runAcademicCleanupJob
  );

  registerCron(
    "academia-marks-attendance-sync",
    readCron("CRON_ACADEMIA_MARKS_ATTENDANCE_SYNC", "*/30 * * * *"),
    jobService.runAcademiaMarksAttendanceSyncJob
  );

  registerCron(
    "academia-reports-sync",
    readCron("CRON_ACADEMIA_REPORTS_SYNC", "30 3 * * *"),
    jobService.runAcademiaReportsSyncJob
  );

  registerCron(
    "oauth-nonce-cleanup",
    readCron("CRON_OAUTH_NONCE_CLEANUP", "*/30 * * * *"),
    jobService.runOAuthNonceCleanupJob
  );

  registerCron(
    "metrics-recompute",
    readCron("CRON_METRICS_RECOMPUTE", "0 2 * * *"),
    jobService.runMetricsRecomputeJob
  );
}

module.exports = {
  bootstrapScheduler
};
