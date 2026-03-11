const recommendationService = require("../services/recommendation.service");
const { enqueueJob } = require("../queue/producer");
const { JOB_TYPES } = require("../queue/job-types");
const { keyBehaviorSummary, getJson, setJson } = require("../cache/cache.service");

async function getBehaviorSummary(req, res, next) {
  try {
    const range = req.query?.range || "all";
    const cacheKey = keyBehaviorSummary(req.user.userId, range);
    const cached = await getJson(cacheKey, "behavior-summary");
    if (cached) {
      return res.status(200).json(cached);
    }

    const summary = await recommendationService.getBehaviorSummary(req.user.userId, range);
    await setJson(cacheKey, summary, Number(process.env.BEHAVIOR_CACHE_TTL_SECONDS || 900));
    return res.status(200).json(summary);
  } catch (error) {
    return next(error);
  }
}

async function recomputeForUser(req, res, next) {
  try {
    const job = await enqueueJob(JOB_TYPES.USER_METRICS_RECOMPUTE, {
      userId: req.user.userId,
      source: "api",
      requestId: req.requestId,
      idempotencyKey: req.body?.idempotencyKey || req.query?.idempotencyKey || null
    });
    return res.status(202).json({ enqueued: true, ...job });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getBehaviorSummary,
  recomputeForUser
};
