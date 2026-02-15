import { Router } from "express";

import { authController } from "./auth.controller";

export const authRouter = Router();

authRouter.get("/google", (req, res) => authController.startGoogleAuth(req, res));
authRouter.get("/google/callback", async (req, res, next) => {
  try {
    await authController.googleCallback(req, res);
  } catch (error) {
    next(error);
  }
});
