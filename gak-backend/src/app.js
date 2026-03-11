const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");

dotenv.config();

const logger = require("./observability/logger");
const { exposeMetrics } = require("./observability/metrics");
const { assertJwtSecretsForRuntime } = require("./utils/jwt.util");
const { assertSecurityRuntimeConfig } = require("./utils/security.util");
const requestContextMiddleware = require("./middleware/request-context.middleware");
const metricsMiddleware = require("./middleware/metrics.middleware");
const auditMiddleware = require("./middleware/audit.middleware");
const authMiddleware = require("./middleware/auth.middleware");
const userRoutes = require("./routes/user.routes");
const academicRoutes = require("./routes/academic.routes");
const fitnessRoutes = require("./routes/fitness.routes");
const nutritionRoutes = require("./routes/nutrition.routes");
const integrationRoutes = require("./routes/integration.routes");
const behaviorRoutes = require("./routes/behavior.routes");
const advancedAnalyticsRoutes = require("./routes/advanced-analytics.routes");
const historyRoutes = require("./routes/history.routes");
const jobsRoutes = require("./routes/jobs.routes");
const integrationController = require("./controllers/integration.controller");

const app = express();

app.disable("x-powered-by");
assertJwtSecretsForRuntime();
assertSecurityRuntimeConfig();
const isProduction = String(process.env.NODE_ENV || "").toLowerCase() === "production";

function normalizeOrigin(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.origin.toLowerCase();
  } catch (_error) {
    return raw.replace(/\/+$/, "").toLowerCase();
  }
}

function buildAllowedOrigins() {
  const configured = String(process.env.CORS_ORIGINS || process.env.FRONTEND_URL || "")
    .split(",")
    .map((s) => normalizeOrigin(s))
    .filter(Boolean);

  if (configured.length) {
    return configured;
  }

  return [
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:8081",
    "http://127.0.0.1:8081",
    "http://localhost:5173",
    "http://127.0.0.1:5173"
  ].map((origin) => normalizeOrigin(origin));
}

const allowedOrigins = buildAllowedOrigins();

function isPrivateDevOrigin(origin) {
  if (isProduction) return false;
  const value = normalizeOrigin(origin);
  if (!value) return false;
  return /^http:\/\/(?:localhost|127\.0\.0\.1|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?::(?:8080|8081|5173))$/.test(value);
}

app.use(
  cors({
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 600,
    origin(origin, callback) {
      if (!origin) {
        return callback(null, !isProduction);
      }

      if (allowedOrigins.includes(normalizeOrigin(origin))) {
        return callback(null, true);
      }
      if (isPrivateDevOrigin(origin)) {
        return callback(null, true);
      }

      return callback(new Error("CORS origin blocked"));
    }
  })
);

// Security middleware should be installed before routes to cover all endpoints.
app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(requestContextMiddleware);
app.use(metricsMiddleware);
app.use(auditMiddleware);

app.use((req, res, next) => {
  const requireHttps =
    String(process.env.ENFORCE_HTTPS || "").toLowerCase() === "true"
    || String(process.env.NODE_ENV || "").toLowerCase() === "production";
  if (!requireHttps) {
    return next();
  }

  const host = String(req.headers.host || "");
  const localHost = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const proto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();

  if (req.secure || proto === "https" || localHost) {
    return next();
  }

  return res.status(426).json({ message: "HTTPS is required in this environment" });
});

// Basic abuse protection (especially for auth endpoints)
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isProduction ? 120 : 5000,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === "/health"
  })
);

app.get("/health", (_req, res) => {
  res.json({ ok: true, module: "dbms-backend" });
});
app.get("/metrics", exposeMetrics);
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.get(
  "/api/integrations/google/callback",
  rateLimit({
    windowMs: 10 * 60 * 1000,
    max: isProduction ? 50 : 1000,
    standardHeaders: true,
    legacyHeaders: false
  }),
  integrationController.handleGoogleCallbackPublic
);

app.use("/api/users", userRoutes);
app.use("/api/academic", authMiddleware, academicRoutes);
app.use("/api/fitness", authMiddleware, fitnessRoutes);
app.use("/api/nutrition", authMiddleware, nutritionRoutes);
app.use("/api/integrations", authMiddleware, integrationRoutes);
app.use("/api/behavior", authMiddleware, behaviorRoutes);
app.use("/api/advanced-analytics", authMiddleware, advancedAnalyticsRoutes);
app.use("/api/history", authMiddleware, historyRoutes);
app.use("/api/jobs", authMiddleware, jobsRoutes);

app.use((err, _req, res, _next) => {
  logger.error(
    {
      request_id: _req?.requestId || null,
      user_id: _req?.user?.userId || null,
      method: _req?.method || null,
      route: _req?.originalUrl || null,
      status: 500,
      error_code: err?.code || "internal_error",
      message: String(err?.message || err)
    },
    "api_error"
  );
  if (String(err.message || "").includes("CORS origin blocked")) {
    return res.status(403).json({ message: "CORS origin blocked" });
  }
  res.status(500).json({ message: "Internal server error" });
});

module.exports = app;
