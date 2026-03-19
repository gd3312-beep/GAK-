const { getRedis } = require("../config/redis");
const { observeCache } = require("../observability/metrics");

const DEFAULT_TTL_SECONDS = Number(process.env.REDIS_CACHE_TTL_SECONDS || 600);

function keyBehaviorSummary(userId, range) {
  return `behavior-summary:${userId}:${range}`;
}

function keyHistory(userId, range, domain) {
  return `history:${userId}:${range}:${domain}`;
}

async function getJson(key, keyspace) {
  const redis = getRedis();
  const raw = await redis.get(key);
  const hit = raw !== null;
  observeCache({ keyspace, hit });
  if (!hit) return null;
  try {
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

async function setJson(key, value, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const redis = getRedis();
  await redis.set(key, JSON.stringify(value), "EX", Math.max(60, Number(ttlSeconds || DEFAULT_TTL_SECONDS)));
}

async function delPattern(pattern) {
  const redis = getRedis();
  const keys = [];
  let cursor = "0";
  do {
    const [nextCursor, batch] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 200);
    cursor = nextCursor;
    if (batch.length) {
      keys.push(...batch);
    }
  } while (cursor !== "0");

  if (keys.length) {
    await redis.del(...keys);
  }
  return keys.length;
}

async function invalidateUserCache(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return 0;
  const [summary, history] = await Promise.all([
    delPattern(`behavior-summary:${uid}:*`),
    delPattern(`history:${uid}:*`)
  ]);
  return summary + history;
}

async function invalidateAllComputedCache() {
  const [summary, history] = await Promise.all([
    delPattern("behavior-summary:*") ,
    delPattern("history:*")
  ]);
  return summary + history;
}

module.exports = {
  keyBehaviorSummary,
  keyHistory,
  getJson,
  setJson,
  invalidateUserCache,
  invalidateAllComputedCache
};
