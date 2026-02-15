import type { Request, Response } from "express";

import type { CreateWorkoutSessionDto, WorkoutActionDto } from "./fitness.types";
import { fitnessService } from "./fitness.service";

class FitnessController {
  async createSession(req: Request, res: Response): Promise<void> {
    const session = await fitnessService.createSession(req.user!.id, req.validatedBody as CreateWorkoutSessionDto);
    res.status(201).json(session);
  }

  async logAction(req: Request, res: Response): Promise<void> {
    const action = await fitnessService.logAction(req.user!.id, req.validatedBody as WorkoutActionDto);
    res.status(201).json(action);
  }

  async consistency(req: Request, res: Response): Promise<void> {
    const consistency = await fitnessService.getConsistency(req.user!.id);
    res.status(200).json(consistency);
  }
}

export const fitnessController = new FitnessController();
