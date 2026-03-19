import type { Request, Response } from "express";

import { BehaviorAction, BehaviorDomain } from "../../types/enums";
import { behaviorService } from "./behavior.service";
import type { BehaviorLogDto } from "./behavior.types";

class BehaviorController {
  async log(req: Request, res: Response): Promise<void> {
    const body = req.validatedBody as BehaviorLogDto;

    const log = await behaviorService.logAction({
      userId: req.user!.id,
      domain: body.domain as BehaviorDomain,
      entityId: body.entityId,
      action: body.action as BehaviorAction
    });

    res.status(201).json(log);
  }

  async timeline(req: Request, res: Response): Promise<void> {
    const timeline = await behaviorService.getUserBehaviorTimeline(req.user!.id);
    res.status(200).json(timeline);
  }
}

export const behaviorController = new BehaviorController();
