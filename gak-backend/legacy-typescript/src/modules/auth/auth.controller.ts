import type { Request, Response } from "express";

import { authService } from "./auth.service";

class AuthController {
  startGoogleAuth(_req: Request, res: Response): void {
    const authUrl = authService.getGoogleAuthUrl();
    res.status(200).json({ authUrl });
  }

  async googleCallback(req: Request, res: Response): Promise<void> {
    const code = req.query.code;

    if (typeof code !== "string") {
      res.status(400).json({ message: "Missing OAuth code" });
      return;
    }

    const result = await authService.handleGoogleCallback(code);
    res.status(200).json(result);
  }
}

export const authController = new AuthController();
