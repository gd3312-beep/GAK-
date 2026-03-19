const { Queue } = require("bullmq");
const { getRedis } = require("../config/redis");

const QUEUE_NAMES = {
  SYNC: "gak-sync",
  DLQ: "gak-sync-dlq"
};

function queueOptions() {
  return {
    connection: getRedis(),
    defaultJobOptions: {
      attempts: Number(process.env.JOB_ATTEMPTS || 5),
      backoff: {
        type: "exponential",
        delay: Number(process.env.JOB_BACKOFF_MS || 30000)
      },
      removeOnComplete: {
        age: Number(process.env.JOB_KEEP_COMPLETE_SECONDS || 3600)
      },
      removeOnFail: {
        age: Number(process.env.JOB_KEEP_FAILED_SECONDS || 86400)
      }
    }
  };
}

function jobsEnabled() {
  const raw = String(process.env.ENABLE_JOBS || "true").trim().toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "off";
}

function createDisabledQueue(name) {
  return {
    name,
    async add() {
      throw new Error("Background jobs are disabled");
    },
    async getJob() {
      return null;
    }
  };
}

const syncQueue = jobsEnabled()
  ? new Queue(QUEUE_NAMES.SYNC, queueOptions())
  : createDisabledQueue(QUEUE_NAMES.SYNC);

const dlqQueue = jobsEnabled()
  ? new Queue(QUEUE_NAMES.DLQ, { connection: getRedis() })
  : createDisabledQueue(QUEUE_NAMES.DLQ);

module.exports = {
  QUEUE_NAMES,
  jobsEnabled,
  syncQueue,
  dlqQueue
};
