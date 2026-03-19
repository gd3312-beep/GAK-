const pino = require("pino");

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  base: {
    service: process.env.SERVICE_NAME || "gak-api"
  },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "body.password",
      "body.refresh_token",
      "body.access_token",
      "password",
      "token"
    ],
    remove: true
  }
});

module.exports = logger;
