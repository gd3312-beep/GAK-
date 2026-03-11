const integrationService = require("./integration.service");
const behaviorService = require("./behavior.service");
const recommendationService = require("./recommendation.service");
const integrationModel = require("../models/integration.model");

function getIstDateOnly(daysOffset = 0) {
  const now = new Date();
  const shifted = new Date(now.getTime() + (Number(daysOffset || 0) * 24 * 60 * 60 * 1000));
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(shifted);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

async function runTokenRefreshJob() {
  return integrationService.refreshGoogleTokensJob();
}

async function runGmailSyncJob(options = {}) {
  const requestedUserId = options?.userId ? String(options.userId) : null;
  const accounts = requestedUserId
    ? [{ user_id: requestedUserId }]
    : await integrationModel.listGoogleAccountsWithRefreshToken();
  const users = [...new Set(accounts.map((row) => row.user_id).filter(Boolean))];
  let processedUsers = 0;
  let totalEmails = 0;
  let failedUsers = 0;

  for (const userId of users) {
    try {
      const result = await integrationService.parseGmailForAcademicEvents(userId);
      processedUsers += 1;
      totalEmails += Number(result.processed || 0);
    } catch (_error) {
      failedUsers += 1;
    }
  }

  return {
    provider: "gmail",
    processedUsers,
    records_ingested: totalEmails,
    records_failed: failedUsers
  };
}

async function runCalendarSyncJob() {
  return integrationService.syncPendingCalendarEvents();
}

async function runMetricsRecomputeJob() {
  const startedAt = Date.now();
  const metrics = await behaviorService.recomputeAllDomainMetrics();
  const summaries = await recommendationService.recomputeAllBehaviorSummaries();

  return {
    metrics,
    summaries,
    recompute_duration_ms: Date.now() - startedAt,
    users_processed: Number(summaries?.usersProcessed || metrics?.usersProcessed || 0),
    stale_data_count: 0
  };
}

async function runUserMetricsRecomputeJob(options = {}) {
  const userId = options?.userId ? String(options.userId) : null;
  if (!userId) {
    throw new Error("userId is required");
  }
  const startedAt = Date.now();
  await behaviorService.recomputeFitnessMetrics(userId);
  await behaviorService.recomputeAcademicMetrics(userId);
  await behaviorService.recomputeNutritionMetrics(userId);
  const summary = await recommendationService.recomputeBehaviorSummary(userId);
  return {
    userId,
    recompute_duration_ms: Date.now() - startedAt,
    users_processed: 1,
    stale_data_count: 0,
    summary
  };
}

async function runAcademicCleanupJob() {
  const [deletedEnrollments, staleDeadlines] = await Promise.all([
    integrationModel.purgeCompletedAcademicEnrollmentsAll(),
    integrationModel.purgeStaleAcademicDeadlinesAll()
  ]);

  return {
    deletedEnrollments,
    staleDeadlines
  };
}

async function runOAuthNonceCleanupJob() {
  const deleted = await integrationModel.purgeOAuthStateNonces();
  return { deleted };
}

async function runAcademiaMarksAttendanceSyncJob(options = {}) {
  const requestedUserId = options?.userId ? String(options.userId) : null;
  const users = requestedUserId ? [requestedUserId] : await integrationModel.listUsersWithConnectedAcademia();
  let processedUsers = 0;
  let successUsers = 0;
  let failedUsers = 0;

  for (const userId of users) {
    processedUsers += 1;
    try {
      await integrationService.syncAcademiaData(userId);
      successUsers += 1;
    } catch (_error) {
      failedUsers += 1;
    }
  }

  return {
    provider: "academia",
    processedUsers,
    successUsers,
    failedUsers,
    records_ingested: successUsers,
    records_failed: failedUsers
  };
}

async function runAcademiaReportsSyncJob(options = {}) {
  const requestedUserId = options?.userId ? String(options.userId) : null;
  const users = requestedUserId ? [requestedUserId] : await integrationModel.listUsersWithConnectedAcademia();
  let processedUsers = 0;
  let successUsers = 0;
  let failedUsers = 0;

  for (const userId of users) {
    processedUsers += 1;
    try {
      await integrationService.syncAcademiaReportsData(userId);
      successUsers += 1;
    } catch (_error) {
      failedUsers += 1;
    }
  }

  return {
    provider: "academia",
    processedUsers,
    successUsers,
    failedUsers,
    records_ingested: successUsers,
    records_failed: failedUsers
  };
}

async function runFitnessSyncJob(options = {}) {
  const requestedUserId = options?.userId ? String(options.userId) : null;
  const users = requestedUserId
    ? [{ user_id: requestedUserId }]
    : await integrationModel.listUsersWithRefreshToken();
  const todayIst = getIstDateOnly(0);
  const yesterdayIst = getIstDateOnly(-1);
  const includeYesterday = String(process.env.FIT_SYNC_INCLUDE_YESTERDAY || "true").toLowerCase() !== "false";
  const maxUsersRaw = Number(process.env.FIT_SYNC_MAX_USERS || 0);
  const maxUsers = Number.isFinite(maxUsersRaw) && maxUsersRaw > 0 ? Math.floor(maxUsersRaw) : null;
  const userList = maxUsers ? users.slice(0, maxUsers) : users;

  let processedUsers = 0;
  let successUsers = 0;
  let failedUsers = 0;
  let skippedUsers = 0;
  let dailyRowsSynced = 0;
  let bodyRowsSynced = 0;
  const reasons = {};

  const countReason = (reason) => {
    const key = String(reason || "unknown").slice(0, 160);
    reasons[key] = Number(reasons[key] || 0) + 1;
  };

  for (const user of userList) {
    const userId = user?.user_id;
    if (!userId) continue;
    processedUsers += 1;

    try {
      const today = await integrationService.syncGoogleFitDailyMetrics(userId, todayIst).catch((error) => ({
        connected: false,
        reason: String(error?.message || "sync today failed")
      }));
      const yesterday = includeYesterday
        ? await integrationService.syncGoogleFitDailyMetrics(userId, yesterdayIst).catch((error) => ({
          connected: false,
          reason: String(error?.message || "sync yesterday failed")
        }))
        : { connected: false, reason: null };
      const body = await integrationService.syncGoogleFitBodyMetrics(userId).catch((error) => ({
        connected: false,
        reason: String(error?.message || "sync body failed")
      }));

      const anyConnected = Boolean(today?.connected || yesterday?.connected || body?.connected);
      const hardFailure = !anyConnected
        && [today?.reason, yesterday?.reason, body?.reason]
          .some((msg) => /invalid|forbidden|missing|denied|token|permission|selected|connected/i.test(String(msg || "")));

      if (today?.connected) dailyRowsSynced += 1;
      if (includeYesterday && yesterday?.connected) dailyRowsSynced += 1;
      if (body?.connected) bodyRowsSynced += 1;

      if (anyConnected) {
        successUsers += 1;
      } else if (hardFailure) {
        failedUsers += 1;
        countReason(today?.reason || yesterday?.reason || body?.reason || "fitness sync failed");
      } else {
        skippedUsers += 1;
        countReason(today?.reason || yesterday?.reason || body?.reason || "no fit data");
      }
    } catch (error) {
      failedUsers += 1;
      countReason(String(error?.message || "fitness sync failed"));
    }
  }

  return {
    provider: "google_fit",
    processedUsers,
    successUsers,
    failedUsers,
    skippedUsers,
    todayIst,
    yesterdayIst: includeYesterday ? yesterdayIst : null,
    includeYesterday,
    records_ingested: dailyRowsSynced + bodyRowsSynced,
    records_failed: failedUsers,
    dailyRowsSynced,
    bodyRowsSynced,
    reasons
  };
}

async function runAllJobs() {
  const [tokens, gmail, calendar, recompute, academicCleanup, oauthNonceCleanup, fitness] = await Promise.all([
    runTokenRefreshJob(),
    runGmailSyncJob(),
    runCalendarSyncJob(),
    runMetricsRecomputeJob(),
    runAcademicCleanupJob(),
    runOAuthNonceCleanupJob(),
    runFitnessSyncJob()
  ]);

  return { tokens, gmail, calendar, recompute, academicCleanup, oauthNonceCleanup, fitness };
}

module.exports = {
  runTokenRefreshJob,
  runGmailSyncJob,
  runCalendarSyncJob,
  runMetricsRecomputeJob,
  runUserMetricsRecomputeJob,
  runAcademicCleanupJob,
  runOAuthNonceCleanupJob,
  runFitnessSyncJob,
  runAcademiaMarksAttendanceSyncJob,
  runAcademiaReportsSyncJob,
  runAllJobs
};
