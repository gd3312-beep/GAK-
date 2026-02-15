import { Router } from "express";

import { authMiddleware } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validation.middleware";
import { behaviorController } from "./behavior.controller";
import { behaviorLogSchema } from "./behavior.types";

export const behaviorRouter = Router();

behaviorRouter.use(authMiddleware);

behaviorRouter.post("/log", validate(behaviorLogSchema), async (req, res, next) => {
  try {
    await behaviorController.log(req, res);
  } catch (error) {
    next(error);
  }
});

behaviorRouter.get("/timeline", async (req, res, next) => {
  try {
    await behaviorController.timeline(req, res);
  } catch (error) {
    next(error);
  }
});
