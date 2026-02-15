const express = require("express");

const historyController = require("../controllers/history.controller");

const router = express.Router();

router.get("/academic", historyController.getAcademicHistory);
router.get("/fitness", historyController.getFitnessHistory);
router.get("/nutrition", historyController.getNutritionHistory);

module.exports = router;

