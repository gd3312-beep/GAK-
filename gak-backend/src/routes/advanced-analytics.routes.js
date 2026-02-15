const express = require("express");

const analyticsController = require("../controllers/advanced-analytics.controller");

const router = express.Router();

router.get("/behavior-summary", analyticsController.getBehaviorSummary);
router.post("/behavior-summary/recompute", analyticsController.recomputeForUser);

module.exports = router;
