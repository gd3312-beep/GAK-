const { randomUUID } = require("crypto");

const behaviorModel = require("../models/behavior.model");

function buildRecommendations(metrics) {
  const recommendations = [];

  if (metrics.fitness && Number(metrics.fitness.skip_rate) > 0.6) {
    recommendations.push({
      id: randomUUID(),
      domain: "fitness",
      text: "Your skip rate is above 60%. Reschedule workouts to your best completion hour."
    });
  }

  if (metrics.fitness && Number(metrics.fitness.exam_week_drop_percentage) > 30) {
    recommendations.push({
      id: randomUUID(),
      domain: "fitness",
      text: "Exam weeks reduce workout consistency significantly. Switch to short maintenance sessions during exam weeks."
    });
  }

  if (metrics.academic && Number(metrics.academic.avg_attendance) < 0.75) {
    recommendations.push({
      id: randomUUID(),
      domain: "academic",
      text: "Attendance is below 75%. Prioritize attendance-critical classes this week."
    });
  }

  if (metrics.nutrition && Number(metrics.nutrition.protein_deficit_ratio) > 0.4) {
    recommendations.push({
      id: randomUUID(),
      domain: "nutrition",
      text: "Protein deficit is frequent. Add a high-protein meal in the first half of the day."
    });
  }

  if (
    metrics.academic &&
    metrics.fitness &&
    Number(metrics.academic.avg_attendance) < 0.75 &&
    Number(metrics.fitness.skip_rate) > 0.5
  ) {
    recommendations.push({
      id: randomUUID(),
      domain: "cross_domain",
      text: "Attendance pressure and workout skips are rising together. Use a lighter workout on heavy academic days."
    });
  }

  return recommendations;
}

async function recomputeBehaviorSummary(userId) {
  const metrics = await behaviorModel.getMetricsForSummary(userId);

  const academicScoreIndex = metrics.academic ? Number((Number(metrics.academic.goal_adherence_score) * 100).toFixed(2)) : 0;
  const fitnessDisciplineIndex = metrics.fitness ? Number(((1 - Number(metrics.fitness.skip_rate)) * 100).toFixed(2)) : 0;
  const nutritionBalanceIndex = metrics.nutrition
    ? Number((100 - Number(metrics.nutrition.protein_deficit_ratio) * 100 - Number(metrics.nutrition.over_limit_days || 0)).toFixed(2))
    : 0;

  const overallConsistencyIndex = Number(
    ((academicScoreIndex + fitnessDisciplineIndex + nutritionBalanceIndex) / 3).toFixed(2)
  );

  await behaviorModel.upsertBehaviorSummary({
    userId,
    academicScoreIndex,
    fitnessDisciplineIndex,
    nutritionBalanceIndex,
    overallConsistencyIndex
  });

  const recommendations = buildRecommendations(metrics);
  await behaviorModel.replaceRecommendations(userId, recommendations);

  return behaviorModel.getBehaviorSummary(userId);
}

async function getBehaviorSummary(userId) {
  return behaviorModel.getBehaviorSummary(userId);
}

async function recomputeAllBehaviorSummaries() {
  const users = await behaviorModel.listAllUsers();

  for (const user of users) {
    await recomputeBehaviorSummary(user.user_id);
  }

  return { usersProcessed: users.length };
}

module.exports = {
  recomputeBehaviorSummary,
  getBehaviorSummary,
  recomputeAllBehaviorSummaries
};
