const { createHash } = require("crypto");

const { syncQueue } = require("./queues");
const { assertJobPayload } = require("../shared/schemas/job.schema");

function createIdempotencyKey(jobType, payload) {
  if (payload.idempotencyKey) {
    return `${jobType}:${payload.idempotencyKey}`;
  }

  const windowSeconds = Math.max(30, Number(process.env.IDEMPOTENCY_WINDOW_SECONDS || 300));
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const stable = {
    jobType,
    userId: payload.userId || null,
    source: payload.source || "api",
    bucket
  };

  const digest = createHash("sha1").update(JSON.stringify(stable)).digest("hex");
  return `${jobType}:${digest}`;
}

async function enqueueJob(jobType, rawPayload = {}, options = {}) {
  const payload = assertJobPayload(jobType, rawPayload);
  const jobId = createIdempotencyKey(jobType, payload);
  let job = null;
  let deduped = false;
  try {
    job = await syncQueue.add(jobType, payload, {
      jobId,
      ...options
    });
  } catch (error) {
    if (String(error?.message || "").toLowerCase().includes("jobid")) {
      deduped = true;
      job = await syncQueue.getJob(jobId);
    } else {
      throw error;
    }
  }

  return {
    queue: syncQueue.name,
    jobId: job ? job.id : jobId,
    jobType,
    deduped
  };
}

module.exports = {
  enqueueJob
};
