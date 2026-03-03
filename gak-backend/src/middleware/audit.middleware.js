const SENSITIVE_QUERY_KEYS = new Set([
  "code",
  "state",
  "token",
  "access_token",
  "refresh_token",
  "password",
  "secret"
]);

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
    const payload = {
      type: "audit",
      ts: new Date().toISOString(),
      method: req.method,
      path: safePath,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
      userId: req.user?.userId || null,
      ip: req.ip || null
    };

    console.log(JSON.stringify(payload));
  });

  next();
}

module.exports = auditMiddleware;
