const integrationService = require("./integration.service");
const behaviorService = require("./behavior.service");
const recommendationService = require("./recommendation.service");
const integrationModel = require("../models/integration.model");

async function runTokenRefreshJob() {
  return integrationService.refreshGoogleTokensJob();
}

async function runGmailSyncJob() {
  const accounts = await integrationModel.listGoogleAccountsWithRefreshToken();
  const users = [...new Set(accounts.map((row) => row.user_id))];
  let processedUsers = 0;
  let totalEmails = 0;

  for (const userId of users) {
    const result = await integrationService.parseGmailForAcademicEvents(userId);
    processedUsers += 1;
    totalEmails += Number(result.processed || 0);
  }

  return { processedUsers, totalEmails };
}

async function runCalendarSyncJob() {
  return integrationService.syncPendingCalendarEvents();
}

async function runMetricsRecomputeJob() {
  const metrics = await behaviorService.recomputeAllDomainMetrics();
  const summaries = await recommendationService.recomputeAllBehaviorSummaries();

  return {
    metrics,
    summaries
  };
}

async function runAllJobs() {
  const [tokens, gmail, calendar, recompute] = await Promise.all([
    runTokenRefreshJob(),
    runGmailSyncJob(),
    runCalendarSyncJob(),
    runMetricsRecomputeJob()
  ]);

  return { tokens, gmail, calendar, recompute };
}

module.exports = {
  runTokenRefreshJob,
  runGmailSyncJob,
  runCalendarSyncJob,
  runMetricsRecomputeJob,
  runAllJobs
};
