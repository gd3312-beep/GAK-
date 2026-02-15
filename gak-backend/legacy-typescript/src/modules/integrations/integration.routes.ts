import { Router } from "express";

import { authMiddleware } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validation.middleware";
import { integrationController } from "./integration.controller";
import { createCalendarEventSchema } from "./integration.types";

export const integrationRouter = Router();

integrationRouter.use(authMiddleware);

integrationRouter.post("/calendar/events", validate(createCalendarEventSchema), async (req, res, next) => {
  try {
    await integrationController.createCalendarEvent(req, res);
  } catch (error) {
    next(error);
  }
});

integrationRouter.post("/gmail/parse", async (req, res, next) => {
  try {
    await integrationController.parseGmail(req, res);
  } catch (error) {
    next(error);
  }
});
