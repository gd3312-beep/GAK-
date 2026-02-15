import { Router } from "express";

import { authMiddleware } from "../../middleware/auth.middleware";
import { analyticsController } from "./analytics.controller";

export const analyticsRouter = Router();

analyticsRouter.use(authMiddleware);

analyticsRouter.get("/summary", async (req, res, next) => {
  try {
    await analyticsController.getSummary(req, res);
  } catch (error) {
    next(error);
  }
});

analyticsRouter.post("/summary/recompute", async (req, res, next) => {
  try {
    await analyticsController.recomputeSummary(req, res);
  } catch (error) {
    next(error);
  }
});
