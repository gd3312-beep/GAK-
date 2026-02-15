const cron = require("node-cron");

const jobService = require("../services/job.service");

function bootstrapScheduler() {
  if (process.env.ENABLE_JOBS !== "true") {
    return;
  }

  cron.schedule("*/10 * * * *", async () => {
    await jobService.runGmailSyncJob();
  });

  cron.schedule("0 * * * *", async () => {
    await jobService.runTokenRefreshJob();
  });

  cron.schedule("15 * * * *", async () => {
    await jobService.runCalendarSyncJob();
  });

  cron.schedule("0 2 * * *", async () => {
    await jobService.runMetricsRecomputeJob();
  });
}

module.exports = {
  bootstrapScheduler
};
