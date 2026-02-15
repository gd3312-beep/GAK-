import type { NextFunction, Request, Response } from "express";

import { logger } from "../utils/logger";

export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  logger.error("Unhandled request error", err);

  if (err instanceof Error) {
    res.status(500).json({ message: err.message });
    return;
  }

  res.status(500).json({ message: "Internal server error" });
}
