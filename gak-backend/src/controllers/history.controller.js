const historyService = require("../services/history.service");

async function getAcademicHistory(req, res, next) {
  try {
    const range = req.query.range || "semester";
    const payload = await historyService.getAcademicHistory(req.user.userId, range);
    return res.status(200).json(payload);
  } catch (error) {
    return next(error);
  }
}

async function getFitnessHistory(req, res, next) {
  try {
    const range = req.query.range || "week";
    const payload = await historyService.getFitnessHistory(req.user.userId, range);
    return res.status(200).json(payload);
  } catch (error) {
    return next(error);
  }
}

async function getNutritionHistory(req, res, next) {
  try {
    const range = req.query.range || "week";
    const payload = await historyService.getNutritionHistory(req.user.userId, range);
    return res.status(200).json(payload);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getAcademicHistory,
  getFitnessHistory,
  getNutritionHistory
};

