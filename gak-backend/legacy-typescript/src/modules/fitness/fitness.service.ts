import { BehaviorAction, BehaviorDomain } from "../../types/enums";
import { behaviorService } from "../behavior/behavior.service";
import { integrationService } from "../integrations/integration.service";
import { streakScore } from "./behavior.logic";
import type { CreateWorkoutSessionDto, WorkoutActionDto } from "./fitness.types";
import { fitnessRepository } from "./fitness.repository";

class FitnessService {
  async createSession(userId: string, input: CreateWorkoutSessionDto) {
    return fitnessRepository.createSession(userId, input);
  }

  async logAction(userId: string, input: WorkoutActionDto) {
    const action = await fitnessRepository.createAction(userId, {
      sessionId: input.sessionId,
      status: input.action
    });

    await behaviorService.logAction({
      userId,
      domain: BehaviorDomain.FITNESS,
      entityId: input.sessionId,
      action: input.action === "done" ? BehaviorAction.DONE : BehaviorAction.SKIPPED
    });

    if (input.action === "done") {
      await integrationService.pushWorkoutToGoogleFit(userId, input.sessionId);
    }

    return action;
  }

  async getConsistency(userId: string) {
    const actions = await fitnessRepository.getRecentActions(userId);
    const completed = actions.map((item) => item.status === "done");

    return {
      streak: streakScore(completed),
      totalTracked: actions.length
    };
  }
}

export const fitnessService = new FitnessService();
