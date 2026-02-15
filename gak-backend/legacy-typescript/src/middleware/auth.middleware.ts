import type { NextFunction, Request, Response } from "express";

import { prisma } from "../config/database";

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = req.header("x-user-id");

  if (!userId) {
    res.status(401).json({ message: "Missing x-user-id header" });
    return;
  }

  const user = await prisma.appUser.findUnique({ where: { id: userId } });

  if (!user) {
    res.status(401).json({ message: "Invalid user" });
    return;
  }

  req.user = { id: user.id, email: user.email };
  next();
}
