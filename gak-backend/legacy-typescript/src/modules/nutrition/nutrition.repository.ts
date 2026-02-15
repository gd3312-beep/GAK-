import { randomUUID } from "crypto";

import { prisma } from "../../config/database";
import type { CreateFoodLogDto } from "./nutrition.types";

class NutritionRepository {
  async createFoodLog(userId: string, input: CreateFoodLogDto, totalCalories: number) {
    return prisma.foodLog.create({
      data: {
        id: randomUUID(),
        userId,
        logDate: input.logDate,
        totalCalories,
        items: {
          create: input.items.map((item) => ({
            id: randomUUID(),
            foodName: item.foodName,
            quantity: item.quantity,
            calories: item.calories,
            protein: item.protein,
            carbs: item.carbs,
            fats: item.fats
          }))
        }
      },
      include: { items: true }
    });
  }

  async getDailySeries(userId: string) {
    return prisma.foodLog.findMany({
      where: { userId },
      orderBy: { logDate: "asc" },
      take: 30
    });
  }
}

export const nutritionRepository = new NutritionRepository();
