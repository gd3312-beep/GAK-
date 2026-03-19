const { JOB_TYPES } = require("../../queue/job-types");

const KNOWN_TYPES = new Set(Object.values(JOB_TYPES));

function assertJobPayload(jobType, payload = {}) {
  if (!KNOWN_TYPES.has(jobType)) {
    throw new Error(`Unknown job type: ${jobType}`);
  }

  if (
    [
      JOB_TYPES.GMAIL_SYNC,
      JOB_TYPES.ACADEMIA_SYNC,
      JOB_TYPES.ACADEMIA_REPORTS_SYNC,
      JOB_TYPES.FIT_SYNC,
      JOB_TYPES.USER_METRICS_RECOMPUTE
    ].includes(jobType)
    && payload.userId
    && !String(payload.userId).trim()
  ) {
    throw new Error("userId must be non-empty when provided");
  }

  return {
    userId: payload.userId ? String(payload.userId) : null,
    source: payload.source ? String(payload.source) : "api",
    requestId: payload.requestId ? String(payload.requestId) : null,
    idempotencyKey: payload.idempotencyKey ? String(payload.idempotencyKey) : null
  };
}

module.exports = {
  assertJobPayload
};
