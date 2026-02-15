import { Router } from "express";

import { authMiddleware } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validation.middleware";
import { nutritionController } from "./nutrition.controller";
import { createFoodLogSchema } from "./nutrition.types";

export const nutritionRouter = Router();

nutritionRouter.use(authMiddleware);

nutritionRouter.post("/logs", validate(createFoodLogSchema), async (req, res, next) => {
  try {
    await nutritionController.createFoodLog(req, res);
  } catch (error) {
    next(error);
  }
});

nutritionRouter.get("/trend", async (req, res, next) => {
  try {
    await nutritionController.trend(req, res);
  } catch (error) {
    next(error);
  }
});
