import type { Request, Response } from "express";

import type { AcademicGoalDto, AttendanceDto } from "./academic.types";
import { academicService } from "./academic.service";

class AcademicController {
  async markAttendance(req: Request, res: Response): Promise<void> {
    const record = await academicService.markAttendance(req.user!.id, req.validatedBody as AttendanceDto);
    res.status(201).json(record);
  }

  async createGoal(req: Request, res: Response): Promise<void> {
    const goal = await academicService.createGoal(req.user!.id, req.validatedBody as AcademicGoalDto);
    res.status(201).json(goal);
  }

  async attendanceSummary(req: Request, res: Response): Promise<void> {
    const summary = await academicService.attendanceSummary(req.user!.id);
    res.status(200).json(summary);
  }
}

export const academicController = new AcademicController();
