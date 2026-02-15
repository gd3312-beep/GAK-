import { prisma } from "../../config/database";

export async function recomputeNutritionMetrics(userId: string): Promise<void> {
  const logs = await prisma.foodLog.findMany({ where: { userId }, include: { items: true } });

  if (!logs.length) {
    return;
  }

  let totalCalories = 0;
  let overLimitDays = 0;
  let proteinDeficitDays = 0;

  for (const log of logs) {
    const proteinTotal = log.items.reduce((acc, item) => acc + item.protein, 0);
    totalCalories += log.totalCalories;

    if (log.totalCalories > 2400) {
      overLimitDays += 1;
    }

    if (proteinTotal < 60) {
      proteinDeficitDays += 1;
    }
  }

  const avgDailyCalories = totalCalories / logs.length;

  await prisma.nutritionBehaviorMetrics.upsert({
    where: { userId },
    create: {
      userId,
      avgDailyCalories,
      overLimitDays,
      proteinDeficitRatio: proteinDeficitDays / logs.length,
      loggingConsistency: logs.length / 30,
      lastUpdated: new Date()
    },
    update: {
      avgDailyCalories,
      overLimitDays,
      proteinDeficitRatio: proteinDeficitDays / logs.length,
      loggingConsistency: logs.length / 30,
      lastUpdated: new Date()
    }
  });
}
