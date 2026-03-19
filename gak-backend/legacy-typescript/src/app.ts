import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

import { API_PREFIX } from "./config/constants";
import { env } from "./config/env";
import { errorMiddleware } from "./middleware/error.middleware";
import { academicRouter } from "./modules/academic/academic.routes";
import { analyticsRouter } from "./modules/analytics/analytics.routes";
import { authRouter } from "./modules/auth/auth.routes";
import { behaviorRouter } from "./modules/behavior/behavior.routes";
import { fitnessRouter } from "./modules/fitness/fitness.routes";
import { integrationRouter } from "./modules/integrations/integration.routes";
import { nutritionRouter } from "./modules/nutrition/nutrition.routes";
import { userRouter } from "./modules/users/user.routes";

export const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.APP_ORIGIN,
    credentials: true
  })
);
app.use(express.json());
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 250
  })
);

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "gak-backend" });
});

app.use(`${API_PREFIX}/auth`, authRouter);
app.use(`${API_PREFIX}/users`, userRouter);
app.use(`${API_PREFIX}/academic`, academicRouter);
app.use(`${API_PREFIX}/fitness`, fitnessRouter);
app.use(`${API_PREFIX}/nutrition`, nutritionRouter);
app.use(`${API_PREFIX}/integrations`, integrationRouter);
app.use(`${API_PREFIX}/behavior`, behaviorRouter);
app.use(`${API_PREFIX}/analytics`, analyticsRouter);

app.use(errorMiddleware);
