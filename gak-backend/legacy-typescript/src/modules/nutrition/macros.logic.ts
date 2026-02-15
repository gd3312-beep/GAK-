import type { CreateFoodLogDto } from "./nutrition.types";

export function summarizeMacros(input: CreateFoodLogDto): {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
} {
  return input.items.reduce(
    (acc, item) => {
      acc.calories += item.calories;
      acc.protein += item.protein;
      acc.carbs += item.carbs;
      acc.fats += item.fats;
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fats: 0 }
  );
}
