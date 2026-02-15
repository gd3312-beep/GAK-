const behaviorService = require("../services/behavior.service");

async function logBehavior(req, res, next) {
  try {
    const { domain, entityId, action, timestamp, attendancePressure } = req.body;

    if (!domain || !entityId || !action) {
      return res.status(400).json({ message: "domain, entityId, action are required" });
    }

    await behaviorService.logBehavior({
      userId: req.user.userId,
      domain,
      entityId,
      action,
      timestamp,
      attendancePressure: Boolean(attendancePressure)
    });

    return res.status(201).json({ message: "Behavior logged" });
  } catch (error) {
    return next(error);
  }
}

async function getTimeline(req, res, next) {
  try {
    const limit = req.query.limit || 200;
    const rows = await behaviorService.getTimeline(req.user.userId, limit);
    return res.status(200).json(rows);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  logBehavior,
  getTimeline
};
