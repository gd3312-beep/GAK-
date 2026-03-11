const express = require("express");

const jobsController = require("../controllers/jobs.controller");

const router = express.Router();

router.use((req, res, next) => {
  const production = String(process.env.NODE_ENV || "").toLowerCase() === "production";
  if (!production) {
    return next();
  }

  const expected = String(process.env.JOBS_ADMIN_TOKEN || "");
  const provided = String(req.headers["x-jobs-admin-token"] || "");

  if (!expected) {
    return res.status(503).json({ message: "JOBS_ADMIN_TOKEN is required in production" });
  }

  if (provided !== expected) {
    return res.status(403).json({ message: "Forbidden" });
  }

  return next();
});

router.post("/token-refresh", jobsController.runTokenRefresh);
router.post("/gmail-sync", jobsController.runGmailSync);
router.post("/calendar-sync", jobsController.runCalendarSync);
router.post("/fitness-sync", jobsController.runFitnessSync);
router.post("/metrics-recompute", jobsController.runMetrics);
router.post("/academic-cleanup", jobsController.runAcademicCleanup);
router.post("/oauth-nonce-cleanup", jobsController.runOAuthNonceCleanup);
router.post("/academia/marks-attendance-sync", jobsController.runAcademiaMarksAttendanceSync);
router.post("/academia/reports-sync", jobsController.runAcademiaReportsSync);
router.post("/run-all", jobsController.runAll);
router.get("/:jobId", jobsController.getJobStatus);

module.exports = router;
