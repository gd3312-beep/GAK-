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

const syncQueue = new Queue(QUEUE_NAMES.SYNC, queueOptions());
const dlqQueue = new Queue(QUEUE_NAMES.DLQ, { connection: getRedis() });

module.exports = {
  QUEUE_NAMES,
  syncQueue,
  dlqQueue
};
