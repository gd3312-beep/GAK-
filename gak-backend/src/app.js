const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

dotenv.config();

const { assertJwtSecretsForRuntime } = require("./utils/jwt.util");
const { assertSecurityRuntimeConfig } = require("./utils/security.util");
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

function buildAllowedOrigins() {
  const configured = String(process.env.CORS_ORIGINS || process.env.FRONTEND_URL || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (configured.length) {
    return configured;
  }

  return [
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:5173",
    "http://127.0.0.1:5173"
  ];
}

const allowedOrigins = buildAllowedOrigins();

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("CORS origin blocked"));
    }
  })
);

app.use(helmet());
app.use(express.json({ limit: "1mb" }));
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
    max: isProduction ? 200 : 5000,
    standardHeaders: true,
    legacyHeaders: false
  })
);

app.get("/health", (_req, res) => {
  res.json({ ok: true, module: "dbms-backend" });
});

app.get("/api/integrations/google/callback", integrationController.handleGoogleCallbackPublic);

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
  console.error(err);
  if (String(err.message || "").includes("CORS origin blocked")) {
    return res.status(403).json({ message: "CORS origin blocked" });
  }
  res.status(500).json({ message: "Internal server error" });
});

module.exports = app;
