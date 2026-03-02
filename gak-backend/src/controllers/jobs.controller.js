const jobService = require("../services/job.service");

async function runTokenRefresh(req, res, next) {
  try {
    const result = await jobService.runTokenRefreshJob();
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function runGmailSync(req, res, next) {
  try {
    const result = await jobService.runGmailSyncJob();
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function runCalendarSync(req, res, next) {
  try {
    const result = await jobService.runCalendarSyncJob();
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function runFitnessSync(req, res, next) {
  try {
    const result = await jobService.runFitnessSyncJob();
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function runMetrics(req, res, next) {
  try {
    const result = await jobService.runMetricsRecomputeJob();
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function runAcademicCleanup(req, res, next) {
  try {
    const result = await jobService.runAcademicCleanupJob();
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function runOAuthNonceCleanup(req, res, next) {
  try {
    const result = await jobService.runOAuthNonceCleanupJob();
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function runAcademiaMarksAttendanceSync(req, res, next) {
  try {
    const result = await jobService.runAcademiaMarksAttendanceSyncJob();
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function runAcademiaReportsSync(req, res, next) {
  try {
    const result = await jobService.runAcademiaReportsSyncJob();
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function runAll(req, res, next) {
  try {
    const result = await jobService.runAllJobs();
    return res.status(200).json(result);
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
  runAll
};
