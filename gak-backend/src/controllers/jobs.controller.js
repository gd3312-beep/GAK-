const { enqueueJob } = require("../queue/producer");
const { JOB_TYPES } = require("../queue/job-types");
const { syncQueue } = require("../queue/queues");

async function enqueueAndRespond(req, res, next, jobType, payload = {}) {
  try {
    const result = await enqueueJob(jobType, {
      ...payload,
      source: "api",
      requestId: req.requestId
    });
    return res.status(202).json({ enqueued: true, ...result });
  } catch (error) {
    return next(error);
  }
}

async function runTokenRefresh(req, res, next) {
  return enqueueAndRespond(req, res, next, JOB_TYPES.TOKEN_REFRESH);
}

async function runGmailSync(req, res, next) {
  return enqueueAndRespond(req, res, next, JOB_TYPES.GMAIL_SYNC, { userId: req.body?.userId || null });
}

async function runCalendarSync(req, res, next) {
  return enqueueAndRespond(req, res, next, JOB_TYPES.CALENDAR_SYNC);
}

async function runFitnessSync(req, res, next) {
  return enqueueAndRespond(req, res, next, JOB_TYPES.FIT_SYNC, { userId: req.body?.userId || null });
}

async function runMetrics(req, res, next) {
  return enqueueAndRespond(req, res, next, JOB_TYPES.METRICS_RECOMPUTE);
}

async function runAcademicCleanup(req, res, next) {
  return enqueueAndRespond(req, res, next, JOB_TYPES.ACADEMIC_CLEANUP);
}

async function runOAuthNonceCleanup(req, res, next) {
  return enqueueAndRespond(req, res, next, JOB_TYPES.OAUTH_NONCE_CLEANUP);
}

async function runAcademiaMarksAttendanceSync(req, res, next) {
  return enqueueAndRespond(req, res, next, JOB_TYPES.ACADEMIA_SYNC, { userId: req.body?.userId || null });
}

async function runAcademiaReportsSync(req, res, next) {
  return enqueueAndRespond(req, res, next, JOB_TYPES.ACADEMIA_REPORTS_SYNC, { userId: req.body?.userId || null });
}

async function runAll(req, res, next) {
  try {
    const [tokens, gmail, calendar, metrics, cleanup, oauth, fit] = await Promise.all([
      enqueueJob(JOB_TYPES.TOKEN_REFRESH, { source: "api", requestId: req.requestId }),
      enqueueJob(JOB_TYPES.GMAIL_SYNC, { source: "api", requestId: req.requestId }),
      enqueueJob(JOB_TYPES.CALENDAR_SYNC, { source: "api", requestId: req.requestId }),
      enqueueJob(JOB_TYPES.METRICS_RECOMPUTE, { source: "api", requestId: req.requestId }),
      enqueueJob(JOB_TYPES.ACADEMIC_CLEANUP, { source: "api", requestId: req.requestId }),
      enqueueJob(JOB_TYPES.OAUTH_NONCE_CLEANUP, { source: "api", requestId: req.requestId }),
      enqueueJob(JOB_TYPES.FIT_SYNC, { source: "api", requestId: req.requestId })
    ]);

    return res.status(202).json({
      enqueued: true,
      jobs: { tokens, gmail, calendar, metrics, cleanup, oauth, fit }
    });
  } catch (error) {
    return next(error);
  }
}

async function getJobStatus(req, res, next) {
  try {
    const jobId = String(req.params.jobId || "").trim();
    if (!jobId) {
      return res.status(400).json({ message: "jobId is required" });
    }

    const job = await syncQueue.getJob(jobId);
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    const state = await job.getState();
    return res.status(200).json({
      jobId: String(job.id),
      jobType: job.name,
      state,
      attemptsMade: Number(job.attemptsMade || 0),
      failedReason: job.failedReason || null,
      result: job.returnvalue || null
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  runTokenRefresh,
  runGmailSync,
  runCalendarSync,
  runFitnessSync,
  runMetrics,
  runAcademicCleanup,
  runOAuthNonceCleanup,
  runAcademiaMarksAttendanceSync,
  runAcademiaReportsSync,
  runAll,
  getJobStatus
};
