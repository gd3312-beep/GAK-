const app = require("./src/app");
const logger = require("./src/observability/logger");

const port = process.env.PORT || 4000;

function startServer(host) {
  const server = app.listen(port, host, () => {
    logger.info({ host, port, service: "api-service" }, "api_service_started");
  });

  server.on("error", (error) => {
    const code = String(error?.code || "");
    if ((code === "EPERM" || code === "EACCES") && host !== "127.0.0.1") {
      logger.warn({ host, code }, "host_bind_failed_retrying");
      startServer("127.0.0.1");
      return;
    }
    throw error;
  });
}

const preferredHost = process.env.HOST || "0.0.0.0";
startServer(preferredHost);
