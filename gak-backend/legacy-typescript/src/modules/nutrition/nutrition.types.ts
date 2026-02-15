import { z } from "zod";

export const foodItemSchema = z.object({
  foodName: z.string().min(1),
  quantity: z.number().positive(),
  calories: z.number().nonnegative(),
  protein: z.number().nonnegative(),
  carbs: z.number().nonnegative(),
  fats: z.number().nonnegative()
});

export const createFoodLogSchema = z.object({
  logDate: z.coerce.date(),
  items: z.array(foodItemSchema).min(1)
});

export type CreateFoodLogDto = z.infer<typeof createFoodLogSchema>;
