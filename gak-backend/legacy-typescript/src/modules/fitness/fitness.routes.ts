import { Router } from "express";

import { authMiddleware } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validation.middleware";
import { fitnessController } from "./fitness.controller";
import { createWorkoutSessionSchema, workoutActionSchema } from "./fitness.types";

export const fitnessRouter = Router();

fitnessRouter.use(authMiddleware);

fitnessRouter.post("/sessions", validate(createWorkoutSessionSchema), async (req, res, next) => {
  try {
    await fitnessController.createSession(req, res);
  } catch (error) {
    next(error);
  }
});

fitnessRouter.post("/actions", validate(workoutActionSchema), async (req, res, next) => {
  try {
    await fitnessController.logAction(req, res);
  } catch (error) {
    next(error);
  }
});

fitnessRouter.get("/consistency", async (req, res, next) => {
  try {
    await fitnessController.consistency(req, res);
  } catch (error) {
    next(error);
  }
});
