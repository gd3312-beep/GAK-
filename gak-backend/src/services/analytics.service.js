const workoutModel = require("../models/workout.model");
const foodModel = require("../models/food.model");

function calculateBmi(metric) {
  if (!metric || !metric.height || !metric.weight) {
    return null;
  }

  let heightInMeters = Number(metric.height);

  if (heightInMeters > 3) {
    heightInMeters = heightInMeters / 100;
  }

  if (heightInMeters <= 0) {
    return null;
  }

  return Number((Number(metric.weight) / (heightInMeters * heightInMeters)).toFixed(2));
}

async function getFitnessSummary(userId) {
  const [completion, caloriesRate, metric] = await Promise.all([
    workoutModel.getWorkoutCompletionRate(userId),
    workoutModel.getCaloriesPerMinute(userId),
    workoutModel.getLatestBodyMetric(userId)
  ]);

  return {
    completionRate: Number(completion.completion_rate || 0),
    completedActions: Number(completion.completed_actions || 0),
    totalActions: Number(completion.total_actions || 0),
    caloriesPerMinute: caloriesRate.calories_per_minute === null ? null : Number(caloriesRate.calories_per_minute),
    bmi: calculateBmi(metric),
    height: metric?.height === undefined || metric?.height === null ? null : Number(metric.height),
    weight: metric?.weight === undefined || metric?.weight === null ? null : Number(metric.weight)
  };
}

async function getDailyNutritionSummary(userId, date) {
  const daily = await foodModel.getDailyNutritionByUser(userId, date);

  return {
    date,
    totalCalories: Number(daily.total_calories || 0),
    totalProtein: Number(daily.total_protein || 0),
    totalCarbs: Number(daily.total_carbs || 0),
    totalFats: Number(daily.total_fats || 0)
  };
}

module.exports = {
  getFitnessSummary,
  getDailyNutritionSummary
};
