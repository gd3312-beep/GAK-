const { observeApiRequest } = require("../observability/metrics");

function metricsMiddleware(req, res, next) {
  const startedAt = Date.now();
  res.on("finish", () => {
    observeApiRequest({
      method: req.method,
      route: `${req.baseUrl || ""}${req.path || ""}` || req.originalUrl || "unknown",
      status: res.statusCode,
      durationMs: Date.now() - startedAt
    });
  });
  next();
}

module.exports = metricsMiddleware;
