import { prisma } from "../../config/database";

class AnalyticsRepository {
  async getDomainMetrics(userId: string) {
    return Promise.all([
      prisma.fitnessBehaviorMetrics.findUnique({ where: { userId } }),
      prisma.academicBehaviorMetrics.findUnique({ where: { userId } }),
      prisma.nutritionBehaviorMetrics.findUnique({ where: { userId } })
    ]);
  }

  async upsertSummary(input: {
    userId: string;
    academicScoreIndex: number;
    fitnessDisciplineIndex: number;
    nutritionBalanceIndex: number;
    overallConsistencyIndex: number;
  }) {
    return prisma.userBehaviorSummary.upsert({
      where: { userId: input.userId },
      create: {
        ...input,
        lastComputed: new Date()
      },
      update: {
        ...input,
        lastComputed: new Date()
      }
    });
  }

  async getSummaryWithRecommendations(userId: string) {
    return Promise.all([
      prisma.userBehaviorSummary.findUnique({ where: { userId } }),
      prisma.userRecommendation.findMany({ where: { userId }, orderBy: { generatedAt: "desc" }, take: 10 })
    ]);
  }

  async listUserIds(): Promise<string[]> {
    const users = await prisma.appUser.findMany({ select: { id: true } });
    return users.map((user) => user.id);
  }
}

export const analyticsRepository = new AnalyticsRepository();
