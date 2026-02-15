import type { Request, Response } from "express";

import type { UpdateUserDto } from "./user.types";
import { userService } from "./user.service";

class UserController {
  async getProfile(req: Request, res: Response): Promise<void> {
    const profile = await userService.getProfile(req.user!.id);
    res.status(200).json(profile);
  }

  async updateProfile(req: Request, res: Response): Promise<void> {
    const updated = await userService.updateProfile(req.user!.id, req.validatedBody as UpdateUserDto);
    res.status(200).json(updated);
  }
}

export const userController = new UserController();
