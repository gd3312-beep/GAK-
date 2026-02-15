import type { NextFunction, Request, Response } from "express";
import { ZodError, type AnyZodObject } from "zod";

export function validate(schema: AnyZodObject) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.validatedBody = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: "Validation failed", issues: error.issues });
        return;
      }

      res.status(400).json({ message: "Invalid payload" });
    }
  };
}
