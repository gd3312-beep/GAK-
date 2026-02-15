import type { Request, Response } from "express";

import type { CreateCalendarEventDto } from "./integration.types";
import { integrationService } from "./integration.service";

class IntegrationController {
  async createCalendarEvent(req: Request, res: Response): Promise<void> {
    const event = await integrationService.createCalendarEvent(req.user!.id, req.validatedBody as CreateCalendarEventDto);
    res.status(201).json(event);
  }

  async parseGmail(req: Request, res: Response): Promise<void> {
    const processed = await integrationService.parseGmailForAcademicEvents(req.user!.id);
    res.status(200).json({ processed });
  }
}

export const integrationController = new IntegrationController();
