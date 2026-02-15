const { randomUUID } = require("crypto");

const foodModel = require("../models/food.model");
const analyticsService = require("../services/analytics.service");
const behaviorService = require("../services/behavior.service");

function ensureSelf(req, res, paramName = "userId") {
  const paramValue = req.params?.[paramName];
  if (paramValue && paramValue !== req.user.userId) {
    res.status(403).json({ message: "Forbidden" });
    return false;
  }
  return true;
}

async function uploadFoodImage(req, res, next) {
  try {
    const { imageUrl, foodName } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ message: "imageUrl is required" });
    }

    const imageId = randomUUID();
    await foodModel.createFoodImage({
      imageId,
      userId: req.user.userId,
      imageUrl
    });

    let detected = null;

    if (foodName) {
      detected = await foodModel.createDetectedFood({
        detectedId: randomUUID(),
        imageId,
        foodName,
        confidenceScore: 0.9
      });
    }

    return res.status(201).json({ imageId, detected });
  } catch (error) {
    return next(error);
  }
}

async function confirmFood(req, res, next) {
  try {
    const { detectedId, quantity, calories, protein, carbs, fats } = req.body;

    if (!detectedId || quantity === undefined || calories === undefined) {
      return res.status(400).json({ message: "detectedId, quantity and calories are required" });
    }

    const exists = await foodModel.detectedItemBelongsToUser(detectedId, req.user.userId);

    if (!exists) {
      return res.status(400).json({ message: "Invalid detected_id: detected item does not exist for user" });
    }

    const confirmedId = randomUUID();

    await foodModel.confirmFoodItem({
      confirmedId,
      detectedId,
      quantity: Number(quantity),
      calories: Number(calories),
      protein: Number(protein || 0),
      carbs: Number(carbs || 0),
      fats: Number(fats || 0)
    });

    await behaviorService.logBehavior({
      userId: req.user.userId,
      domain: "nutrition",
      entityId: confirmedId,
      action: "submitted"
    });

    return res.status(201).json({ message: "Food confirmed", confirmedId });
  } catch (error) {
    return next(error);
  }
}

async function getDailyNutrition(req, res, next) {
  try {
    const { userId } = req.params;
    if (!ensureSelf(req, res, "userId")) return;
    const date = req.query.date || new Date().toISOString().slice(0, 10);

    const summary = await analyticsService.getDailyNutritionSummary(userId, date);
    return res.status(200).json(summary);
  } catch (error) {
    return next(error);
  }
}

function inferMealLabelFromHour(hour) {
  if (hour < 11) return "Breakfast";
  if (hour < 16) return "Lunch";
  if (hour < 19) return "Snack";
  return "Dinner";
}

async function getDailyMeals(req, res, next) {
  try {
    const { userId } = req.params;
    if (!ensureSelf(req, res, "userId")) return;
    const date = req.query.date || new Date().toISOString().slice(0, 10);

    const rows = await foodModel.listMealImagesByUserAndDate(userId, date);

    const meals = new Map();

    for (const row of rows) {
      const uploadedAt = row.uploaded_at ? new Date(row.uploaded_at) : null;
      const hour = uploadedAt ? uploadedAt.getHours() : 12;
      const label = inferMealLabelFromHour(hour);
      const current = meals.get(label) || {
        name: label,
        time: uploadedAt ? uploadedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "--",
        calories: 0,
        items: []
      };

      current.calories += Number(row.calories_total || 0);
      if (row.items) {
        current.items.push(String(row.items));
      }

      meals.set(label, current);
    }

    const order = ["Breakfast", "Lunch", "Snack", "Dinner"];
    const payload = order
      .filter((label) => meals.has(label))
      .map((label) => {
        const m = meals.get(label);
        return {
          name: m.name,
          time: m.time,
          calories: Number(m.calories.toFixed(0)),
          items: m.items.filter(Boolean).join(" • ")
        };
      });

    return res.status(200).json({ date, meals: payload });
  } catch (error) {
    return next(error);
  }
}

async function logManualMeal(req, res, next) {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : null;
    const date = req.body.date ? String(req.body.date) : null;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: "items[] is required" });
    }

    const logDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
    const uploadedAt = logDate ? `${logDate} 12:00:00` : null;

    const imageId = randomUUID();
    await foodModel.createFoodImage({
      imageId,
      userId: req.user.userId,
      imageUrl: `manual://${imageId}`,
      uploadedAt
    });

    const confirmedIds = [];

    for (const raw of items) {
      const name = String(raw?.name || "").trim();
      if (!name) {
        continue;
      }

      const quantity = Number(raw?.quantity ?? 1);
      const calories = Number(raw?.calories ?? 0);
      const protein = Number(raw?.protein ?? 0);
      const carbs = Number(raw?.carbs ?? 0);
      const fats = Number(raw?.fats ?? 0);

      const detectedId = randomUUID();
      await foodModel.createDetectedFood({
        detectedId,
        imageId,
        foodName: name,
        confidenceScore: 1
      });

      const confirmedId = randomUUID();
      await foodModel.confirmFoodItem({
        confirmedId,
        detectedId,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        calories: Number.isFinite(calories) && calories >= 0 ? calories : 0,
        protein: Number.isFinite(protein) && protein >= 0 ? protein : 0,
        carbs: Number.isFinite(carbs) && carbs >= 0 ? carbs : 0,
        fats: Number.isFinite(fats) && fats >= 0 ? fats : 0
      });

      confirmedIds.push(confirmedId);

      await behaviorService.logBehavior({
        userId: req.user.userId,
        domain: "nutrition",
        entityId: confirmedId,
        action: "submitted"
      });
    }

    return res.status(201).json({ message: "Meal logged", imageId, confirmedCount: confirmedIds.length });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  uploadFoodImage,
  confirmFood,
  getDailyNutrition,
  getDailyMeals,
  logManualMeal
};
