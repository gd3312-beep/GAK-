import { BehaviorAction, BehaviorDomain } from "../../types/enums";
import { isExamWeek } from "../../utils/date.helper";
import { prisma } from "../../config/database";
import { recomputeAcademicMetrics } from "./academic.analytics";
import { recomputeFitnessMetrics } from "./fitness.analytics";
import { recomputeNutritionMetrics } from "./nutrition.analytics";
import { behaviorRepository } from "./behavior.repository";

class BehaviorService {
  async logAction(input: {
    userId: string;
    domain: BehaviorDomain;
    entityId: string;
    action: BehaviorAction;
    timestamp?: Date;
    attendancePressure?: boolean;
  }) {
    const timestamp = input.timestamp ?? new Date();

    return behaviorRepository.logBehavior({
      userId: input.userId,
      domain: input.domain,
      entityId: input.entityId,
      action: input.action,
      timestamp,
      examWeek: isExamWeek(timestamp),
      attendancePressure: input.attendancePressure ?? false
    });
  }

  async getUserBehaviorTimeline(userId: string) {
    return prisma.userBehaviorLog.findMany({
      where: { userId },
      orderBy: { timestamp: "desc" },
      take: 500
    });
  }

  async recomputeAllMetrics(): Promise<void> {
    const userIds = await behaviorRepository.getAllUsers();

    for (const userId of userIds) {
      await Promise.all([
        recomputeFitnessMetrics(userId),
        recomputeAcademicMetrics(userId),
        recomputeNutritionMetrics(userId)
      ]);
    }
  }
}

export const behaviorService = new BehaviorService();
