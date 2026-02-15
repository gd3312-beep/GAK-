const express = require("express");
const multer = require("multer");

const fitnessController = require("../controllers/fitness.controller");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

router.post("/plan/upload", upload.single("file"), fitnessController.uploadWorkoutPlan);
router.get("/plan/current", fitnessController.getCurrentWorkoutPlan);
router.get("/workout/today", fitnessController.getTodayWorkoutPlan);
router.post("/workout/today/action", fitnessController.setTodayWorkoutAction);
router.post("/workout/session", fitnessController.createWorkoutSession);
router.patch("/workout/action", fitnessController.updateWorkoutAction);
router.get("/summary/:userId", fitnessController.getFitnessSummary);
router.get("/fit/daily", fitnessController.getFitDaily);
router.get("/fit/range", fitnessController.getFitRange);

module.exports = router;
