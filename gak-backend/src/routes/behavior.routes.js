const express = require("express");

const behaviorController = require("../controllers/behavior.controller");

const router = express.Router();

router.post("/log", behaviorController.logBehavior);
router.get("/timeline", behaviorController.getTimeline);

module.exports = router;
