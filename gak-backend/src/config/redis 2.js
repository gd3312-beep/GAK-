const Redis = require("ioredis");

let redis = null;

function getRedisConfig() {
  const redisUrl = String(process.env.REDIS_URL || "").trim();
  const host = process.env.REDIS_HOST || "127.0.0.1";
  const port = Number(process.env.REDIS_PORT || 6379);
  const password = process.env.REDIS_PASSWORD || undefined;

  if (redisUrl) {
    return { url: redisUrl, maxRetriesPerRequest: null, enableReadyCheck: false };
  }

  return {
    host,
    port,
    password,
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  };
}

function getRedis() {
  if (!redis) {
    redis = new Redis(getRedisConfig());
  }
  return redis;
}

module.exports = {
  getRedis
};
