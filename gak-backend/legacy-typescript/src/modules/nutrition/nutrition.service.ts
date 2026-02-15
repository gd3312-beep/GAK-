import { BehaviorAction, BehaviorDomain } from "../../types/enums";
import { behaviorService } from "../behavior/behavior.service";
import { summarizeMacros } from "./macros.logic";
import type { CreateFoodLogDto } from "./nutrition.types";
import { nutritionRepository } from "./nutrition.repository";

class NutritionService {
  async createFoodLog(userId: string, input: CreateFoodLogDto) {
    const totals = summarizeMacros(input);
    const log = await nutritionRepository.createFoodLog(userId, input, totals.calories);

    await behaviorService.logAction({
      userId,
      domain: BehaviorDomain.NUTRITION,
      entityId: log.id,
      action: BehaviorAction.SUBMITTED
    });

    return log;
  }

  async getTrend(userId: string) {
    return nutritionRepository.getDailySeries(userId);
  }
}

export const nutritionService = new NutritionService();
