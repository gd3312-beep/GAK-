const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

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

dotenv.config();

const app = express();

app.disable("x-powered-by");

const corsOrigins = String(process.env.CORS_ORIGINS || process.env.FRONTEND_URL || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: corsOrigins.length ? corsOrigins : true
  })
);

app.use(helmet());
app.use(express.json({ limit: "1mb" }));

// Basic abuse protection (especially for auth endpoints)
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
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
  res.status(500).json({ message: "Internal server error" });
});

module.exports = app;
