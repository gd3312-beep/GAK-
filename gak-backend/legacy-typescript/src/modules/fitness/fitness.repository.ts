import { randomUUID } from "crypto";

import { prisma } from "../../config/database";
import { SyncStatus } from "../../types/enums";
import type { CreateWorkoutSessionDto } from "./fitness.types";

class FitnessRepository {
  async createSession(userId: string, input: CreateWorkoutSessionDto) {
    return prisma.workoutSession.create({
      data: {
        id: randomUUID(),
        userId,
        workoutDate: input.workoutDate,
        workoutType: input.workoutType,
        muscleGroup: input.muscleGroup,
        caloriesBurned: input.caloriesBurned,
        durationMinutes: input.durationMinutes,
        syncStatus: SyncStatus.PENDING
      }
    });
  }

  async createAction(userId: string, input: { sessionId: string; status: string }) {
    return prisma.workoutAction.create({
      data: {
        id: randomUUID(),
        userId,
        sessionId: input.sessionId,
        status: input.status
      }
    });
  }

  async getRecentActions(userId: string) {
    return prisma.workoutAction.findMany({
      where: { userId },
      orderBy: { performedAt: "desc" },
      take: 30
    });
  }
}

export const fitnessRepository = new FitnessRepository();
