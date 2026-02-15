const recommendationService = require("../services/recommendation.service");
const behaviorService = require("../services/behavior.service");

async function getBehaviorSummary(req, res, next) {
  try {
    const summary = await recommendationService.getBehaviorSummary(req.user.userId);
    return res.status(200).json(summary);
  } catch (error) {
    return next(error);
  }
}

async function recomputeForUser(req, res, next) {
  try {
    const userId = req.user.userId;

    await behaviorService.recomputeFitnessMetrics(userId);
    await behaviorService.recomputeAcademicMetrics(userId);
    await behaviorService.recomputeNutritionMetrics(userId);
    const summary = await recommendationService.recomputeBehaviorSummary(userId);

    return res.status(200).json(summary);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getBehaviorSummary,
  recomputeForUser
};
