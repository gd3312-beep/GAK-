const { Worker, QueueEvents } = require("bullmq");

const logger = require("../observability/logger");
const { observeJob, queueDepthGauge } = require("../observability/metrics");
const { getRedis } = require("../config/redis");
const { syncQueue, dlqQueue } = require("./queues");
const { JOB_TYPES } = require("./job-types");
const jobService = require("../services/job.service");
const { invalidateUserCache, invalidateAllComputedCache } = require("../cache/cache.service");

async function processByType(job) {
  switch (job.name) {
    case JOB_TYPES.GMAIL_SYNC:
      return job.data?.userId
        ? jobService.runGmailSyncJob({ userId: job.data.userId })
        : jobService.runGmailSyncJob();
    case JOB_TYPES.ACADEMIA_SYNC:
      return jobService.runAcademiaMarksAttendanceSyncJob({ userId: job.data?.userId || null });
    case JOB_TYPES.ACADEMIA_REPORTS_SYNC:
      return jobService.runAcademiaReportsSyncJob({ userId: job.data?.userId || null });
    case JOB_TYPES.FIT_SYNC:
      return jobService.runFitnessSyncJob({ userId: job.data?.userId || null });
    case JOB_TYPES.TOKEN_REFRESH:
      return jobService.runTokenRefreshJob();
    case JOB_TYPES.CALENDAR_SYNC:
      return jobService.runCalendarSyncJob();
    case JOB_TYPES.METRICS_RECOMPUTE:
      return jobService.runMetricsRecomputeJob();
    case JOB_TYPES.USER_METRICS_RECOMPUTE:
      return jobService.runUserMetricsRecomputeJob({ userId: job.data?.userId || null });
    case JOB_TYPES.ACADEMIC_CLEANUP:
      return jobService.runAcademicCleanupJob();
    case JOB_TYPES.OAUTH_NONCE_CLEANUP:
      return jobService.runOAuthNonceCleanupJob();
    default:
      throw new Error(`Unsupported job type: ${job.name}`);
  }
}

async function invalidateAfterJob(job) {
  if (job.data?.userId) {
    await invalidateUserCache(job.data.userId);
    return;
  }

  if (
    [
      JOB_TYPES.GMAIL_SYNC,
      JOB_TYPES.ACADEMIA_SYNC,
      JOB_TYPES.ACADEMIA_REPORTS_SYNC,
      JOB_TYPES.FIT_SYNC,
      JOB_TYPES.METRICS_RECOMPUTE
    ].includes(job.name)
  ) {
    await invalidateAllComputedCache();
  }
}

function logJobEvent(level, payload) {
  logger[level](payload, "worker_job");
}

async function snapshotQueueDepth() {
  const counts = await syncQueue.getJobCounts("waiting", "active", "completed", "failed", "delayed");
  for (const [state, count] of Object.entries(counts)) {
    queueDepthGauge.set({ queue: syncQueue.name, state }, Number(count || 0));
  }
}

function startWorker() {
  const worker = new Worker(
    syncQueue.name,
    async (job) => {
      const startedAt = Date.now();
      logJobEvent("info", {
        job_type: job.name,
        job_id: String(job.id),
        request_id: job.data?.requestId || null,
        user_id: job.data?.userId || null,
        source: job.data?.source || "worker",
        started_at: new Date(startedAt).toISOString(),
        retries: Number(job.attemptsMade || 0)
      });

      try {
        const result = await processByType(job);
        const endedAt = Date.now();
        await invalidateAfterJob(job).catch(() => undefined);
        observeJob({ jobType: job.name, status: "success", durationMs: endedAt - startedAt });
        logJobEvent("info", {
          job_type: job.name,
          job_id: String(job.id),
          started_at: new Date(startedAt).toISOString(),
          ended_at: new Date(endedAt).toISOString(),
          duration_ms: endedAt - startedAt,
          retries: Number(job.attemptsMade || 0),
          final_status: "success",
          provider: result?.provider || null,
          records_ingested: Number(result?.records_ingested || 0),
          records_failed: Number(result?.records_failed || 0),
          recompute_duration_ms: Number(result?.recompute_duration_ms || 0),
          users_processed: Number(result?.users_processed || 0),
          stale_data_count: Number(result?.stale_data_count || 0)
        });
        return result;
      } catch (error) {
        const endedAt = Date.now();
        observeJob({ jobType: job.name, status: "failure", durationMs: endedAt - startedAt });
        logJobEvent("error", {
          job_type: job.name,
          job_id: String(job.id),
          started_at: new Date(startedAt).toISOString(),
          ended_at: new Date(endedAt).toISOString(),
          duration_ms: endedAt - startedAt,
          retries: Number(job.attemptsMade || 0),
          final_status: "failed",
          error_code: error?.code || "job_failed",
          error_message: String(error?.message || error)
        });
        throw error;
      }
    },
    {
      connection: getRedis(),
      concurrency: Number(process.env.WORKER_CONCURRENCY || 4)
    }
  );

  const queueEvents = new QueueEvents(syncQueue.name, { connection: getRedis() });
  queueEvents.on("failed", async ({ jobId, failedReason, prev }) => {
    if (prev !== "active") return;
    try {
      const job = await syncQueue.getJob(jobId);
      if (!job || job.attemptsMade < job.opts.attempts) return;
      await dlqQueue.add("dead_letter", {
        job_id: jobId,
        job_type: job.name,
        payload: job.data,
        failed_reason: failedReason,
        failed_at: new Date().toISOString()
      });
    } catch (_error) {
      // no-op
    }
  });

  setInterval(() => {
    snapshotQueueDepth().catch(() => undefined);
  }, Number(process.env.QUEUE_DEPTH_INTERVAL_MS || 15000)).unref();

  return { worker, queueEvents };
}

module.exports = {
  startWorker,
  snapshotQueueDepth
};
