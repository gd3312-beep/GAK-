import { Router } from "express";

import { authMiddleware } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validation.middleware";
import { academicController } from "./academic.controller";
import { academicGoalSchema, attendanceSchema } from "./academic.types";

export const academicRouter = Router();

academicRouter.use(authMiddleware);

academicRouter.post("/attendance", validate(attendanceSchema), async (req, res, next) => {
  try {
    await academicController.markAttendance(req, res);
  } catch (error) {
    next(error);
  }
});

academicRouter.post("/goals", validate(academicGoalSchema), async (req, res, next) => {
  try {
    await academicController.createGoal(req, res);
  } catch (error) {
    next(error);
  }
});

academicRouter.get("/attendance/summary", async (req, res, next) => {
  try {
    await academicController.attendanceSummary(req, res);
  } catch (error) {
    next(error);
  }
});
