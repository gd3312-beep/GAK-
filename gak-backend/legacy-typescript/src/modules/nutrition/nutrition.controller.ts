import type { Request, Response } from "express";

import type { CreateFoodLogDto } from "./nutrition.types";
import { nutritionService } from "./nutrition.service";

class NutritionController {
  async createFoodLog(req: Request, res: Response): Promise<void> {
    const log = await nutritionService.createFoodLog(req.user!.id, req.validatedBody as CreateFoodLogDto);
    res.status(201).json(log);
  }

  async trend(req: Request, res: Response): Promise<void> {
    const trend = await nutritionService.getTrend(req.user!.id);
    res.status(200).json(trend);
  }
}

export const nutritionController = new NutritionController();
