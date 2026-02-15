import type { Request, Response } from "express";

import { summaryService } from "./summary.service";

class AnalyticsController {
  async getSummary(req: Request, res: Response): Promise<void> {
    const data = await summaryService.getSummary(req.user!.id);
    res.status(200).json(data);
  }

  async recomputeSummary(req: Request, res: Response): Promise<void> {
    const summary = await summaryService.recomputeUserSummary(req.user!.id);
    res.status(200).json(summary);
  }
}

export const analyticsController = new AnalyticsController();
