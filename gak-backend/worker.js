const logger = require("./src/observability/logger");
const { bootstrapScheduler } = require("./src/jobs/scheduler");
const { startWorker } = require("./src/queue/worker");

async function start() {
  const { worker, queueEvents } = startWorker();
  bootstrapScheduler();

  worker.on("ready", () => {
    logger.info({ service: "worker-service" }, "worker_service_started");
  });

  worker.on("error", (error) => {
    logger.error({ error_code: error?.code || "worker_error", message: String(error?.message || error) }, "worker_error");
  });

  queueEvents.on("error", (error) => {
    logger.error({ error_code: error?.code || "queue_events_error", message: String(error?.message || error) }, "queue_events_error");
  });
}

start().catch((error) => {
  logger.error({ error_code: error?.code || "worker_boot_error", message: String(error?.message || error) }, "worker_boot_failed");
  process.exitCode = 1;
});
