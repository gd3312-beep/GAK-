const express = require("express");

const fitnessController = require("../controllers/fitness.controller");

const router = express.Router();

let uploadMiddleware = null;

function resolveUploadMiddleware() {
  if (uploadMiddleware) {
    return uploadMiddleware;
  }

  try {
    const multer = require("multer");
    uploadMiddleware = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 }
    }).single("file");
  } catch (error) {
    uploadMiddleware = (_req, _res, next) => next(error);
  }

  return uploadMiddleware;
}

router.post("/plan/upload", (req, res, next) => resolveUploadMiddleware()(req, res, next), fitnessController.uploadWorkoutPlan);
router.get("/plan/current", fitnessController.getCurrentWorkoutPlan);
router.get("/workout/today", fitnessController.getTodayWorkoutPlan);
router.post("/workout/today/action", fitnessController.setTodayWorkoutAction);
router.post("/workout/session", fitnessController.createWorkoutSession);
router.patch("/workout/action", fitnessController.updateWorkoutAction);
router.get("/summary/:userId", fitnessController.getFitnessSummary);
router.get("/fit/daily", fitnessController.getFitDaily);
router.get("/fit/range", fitnessController.getFitRange);
router.get("/fit/activities", fitnessController.getFitActivities);

module.exports = router;
