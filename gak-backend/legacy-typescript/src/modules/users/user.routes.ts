import { Router } from "express";

import { authMiddleware } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validation.middleware";
import { userController } from "./user.controller";
import { updateUserSchema } from "./user.types";

export const userRouter = Router();

userRouter.use(authMiddleware);

userRouter.get("/me", async (req, res, next) => {
  try {
    await userController.getProfile(req, res);
  } catch (error) {
    next(error);
  }
});

userRouter.patch("/me", validate(updateUserSchema), async (req, res, next) => {
  try {
    await userController.updateProfile(req, res);
  } catch (error) {
    next(error);
  }
});
