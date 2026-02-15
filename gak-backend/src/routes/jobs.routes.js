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
router.post("/metrics-recompute", jobsController.runMetrics);
router.post("/run-all", jobsController.runAll);

module.exports = router;
