const historyService = require("../services/history.service");
const { keyHistory, getJson, setJson } = require("../cache/cache.service");

async function getAcademicHistory(req, res, next) {
  try {
    const range = req.query.range || "semester";
    const cacheKey = keyHistory(req.user.userId, range, "academic");
    const cached = await getJson(cacheKey, "history");
    if (cached) {
      return res.status(200).json(cached);
    }
    const payload = await historyService.getAcademicHistory(req.user.userId, range);
    await setJson(cacheKey, payload, Number(process.env.HISTORY_CACHE_TTL_SECONDS || 600));
    return res.status(200).json(payload);
  } catch (error) {
    return next(error);
  }
}

async function getFitnessHistory(req, res, next) {
  try {
    const range = req.query.range || "week";
    const cacheKey = keyHistory(req.user.userId, range, "fitness");
    const cached = await getJson(cacheKey, "history");
    if (cached) {
      return res.status(200).json(cached);
    }
    const payload = await historyService.getFitnessHistory(req.user.userId, range);
    await setJson(cacheKey, payload, Number(process.env.HISTORY_CACHE_TTL_SECONDS || 600));
    return res.status(200).json(payload);
  } catch (error) {
    return next(error);
  }
}

async function getNutritionHistory(req, res, next) {
  try {
    const range = req.query.range || "week";
    const cacheKey = keyHistory(req.user.userId, range, "nutrition");
    const cached = await getJson(cacheKey, "history");
    if (cached) {
      return res.status(200).json(cached);
    }
    const payload = await historyService.getNutritionHistory(req.user.userId, range);
    await setJson(cacheKey, payload, Number(process.env.HISTORY_CACHE_TTL_SECONDS || 600));
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
