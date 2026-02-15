const express = require("express");

const nutritionController = require("../controllers/nutrition.controller");

const router = express.Router();

router.post("/food/analyze", nutritionController.analyzeFoodImage);
router.post("/food/image", nutritionController.uploadFoodImage);
router.post("/food/confirm", nutritionController.confirmFood);
router.post("/food/log", nutritionController.logManualMeal);
router.get("/food/daily/:userId", nutritionController.getDailyNutrition);
router.get("/food/meals/:userId", nutritionController.getDailyMeals);

module.exports = router;
