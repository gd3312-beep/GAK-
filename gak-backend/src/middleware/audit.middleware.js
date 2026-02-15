function auditMiddleware(req, res, next) {
  const startedAt = Date.now();

  res.on("finish", () => {
    const payload = {
      type: "audit",
      ts: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl,
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
