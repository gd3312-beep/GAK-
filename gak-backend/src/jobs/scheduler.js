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

function bootstrapScheduler() {
  if (process.env.ENABLE_JOBS !== "true") {
    return;
  }

  cron.schedule("*/10 * * * *", wrapJob("gmail-sync", jobService.runGmailSyncJob));

  cron.schedule("0 * * * *", wrapJob("token-refresh", jobService.runTokenRefreshJob));

  cron.schedule("15 * * * *", wrapJob("calendar-sync", jobService.runCalendarSyncJob));

  cron.schedule("0 2 * * *", wrapJob("metrics-recompute", jobService.runMetricsRecomputeJob));
}

module.exports = {
  bootstrapScheduler
};
