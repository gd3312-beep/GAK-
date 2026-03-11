const SENSITIVE_QUERY_KEYS = new Set([
  "code",
  "state",
  "token",
  "access_token",
  "refresh_token",
  "password",
  "secret"
]);
const logger = require("../observability/logger");

function sanitizePathWithQuery(originalUrl) {
  try {
    const url = new URL(String(originalUrl || ""), "http://localhost");
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEYS.has(String(key).toLowerCase())) {
        url.searchParams.set(key, "[REDACTED]");
      }
    }
    const query = url.search ? url.search : "";
    return `${url.pathname}${query}`;
  } catch (_error) {
    return String(originalUrl || "").split("?")[0] || "/";
  }
}

function auditMiddleware(req, res, next) {
  const startedAt = Date.now();
  const safePath = sanitizePathWithQuery(req.originalUrl);

  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    const payload = {
      request_id: req.requestId || null,
      user_id: req.user?.userId || null,
      method: req.method,
      route: safePath,
      status: res.statusCode,
      latency_ms: durationMs,
      duration_ms: durationMs,
      source: "api",
      error_code: res.statusCode >= 400 ? "http_error" : null
    };

    if (res.statusCode >= 500) {
      logger.error(payload, "api_request");
      return;
    }
    logger.info(payload, "api_request");
  });

  next();
}

module.exports = auditMiddleware;
