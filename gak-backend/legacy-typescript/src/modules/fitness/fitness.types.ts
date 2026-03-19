import { z } from "zod";

export const createWorkoutSessionSchema = z.object({
  workoutDate: z.coerce.date(),
  workoutType: z.string().min(1),
  muscleGroup: z.string().min(1),
  caloriesBurned: z.number().nonnegative(),
  durationMinutes: z.number().int().positive()
});

export const workoutActionSchema = z.object({
  sessionId: z.string().uuid(),
  action: z.enum(["done", "skipped"])
});

export type CreateWorkoutSessionDto = z.infer<typeof createWorkoutSessionSchema>;
export type WorkoutActionDto = z.infer<typeof workoutActionSchema>;
