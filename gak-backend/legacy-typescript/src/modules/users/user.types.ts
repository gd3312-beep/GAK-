import { z } from "zod";

export const updateUserSchema = z.object({
  fullName: z.string().min(1).optional(),
  heightCm: z.number().positive().optional(),
  weightKg: z.number().positive().optional(),
  goal: z.string().min(1).optional()
});

export type UpdateUserDto = z.infer<typeof updateUserSchema>;
