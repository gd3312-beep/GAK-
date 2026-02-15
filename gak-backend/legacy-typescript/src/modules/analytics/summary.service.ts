import { analyticsRepository } from "./analytics.repository";
import { regenerateRecommendations } from "./recommendation.engine";

class SummaryService {
  async recomputeUserSummary(userId: string) {
    const [fitness, academic, nutrition] = await analyticsRepository.getDomainMetrics(userId);

    const academicScoreIndex = academic ? Number((academic.goalAdherenceScore * 100).toFixed(2)) : 0;
    const fitnessDisciplineIndex = fitness ? Number(((1 - fitness.skipRate) * 100).toFixed(2)) : 0;
    const nutritionBalanceIndex = nutrition
      ? Number((100 - nutrition.proteinDeficitRatio * 100 - nutrition.overLimitDays).toFixed(2))
      : 0;

    const overallConsistencyIndex = Number(
      ((academicScoreIndex + fitnessDisciplineIndex + nutritionBalanceIndex) / 3).toFixed(2)
    );

    const summary = await analyticsRepository.upsertSummary({
      userId,
      academicScoreIndex,
      fitnessDisciplineIndex,
      nutritionBalanceIndex,
      overallConsistencyIndex
    });

    await regenerateRecommendations(userId);
    return summary;
  }

  async getSummary(userId: string) {
    const [summary, recommendations] = await analyticsRepository.getSummaryWithRecommendations(userId);

    return {
      summary,
      recommendations
    };
  }

  async recomputeAllSummaries(): Promise<void> {
    const userIds = await analyticsRepository.listUserIds();

    for (const userId of userIds) {
      await this.recomputeUserSummary(userId);
    }
  }
}

export const summaryService = new SummaryService();
