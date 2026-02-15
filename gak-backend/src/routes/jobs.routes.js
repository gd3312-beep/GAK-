const express = require("express");

const jobsController = require("../controllers/jobs.controller");

const router = express.Router();

router.post("/token-refresh", jobsController.runTokenRefresh);
router.post("/gmail-sync", jobsController.runGmailSync);
router.post("/calendar-sync", jobsController.runCalendarSync);
router.post("/metrics-recompute", jobsController.runMetrics);
router.post("/run-all", jobsController.runAll);

module.exports = router;
