import { app } from "./app";
import { env } from "./config/env";
import { bootstrapJobs } from "./jobs/cron";
import { logger } from "./utils/logger";

const server = app.listen(env.PORT, () => {
  logger.info(`GAK backend listening on port ${env.PORT}`);
  bootstrapJobs();
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
