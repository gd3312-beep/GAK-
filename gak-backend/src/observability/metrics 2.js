const client = require("prom-client");

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const apiLatencyMs = new client.Histogram({
  name: "gak_api_latency_ms",
  help: "API latency in milliseconds",
  labelNames: ["method", "route", "status"],
  buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [register]
});

const apiErrorCount = new client.Counter({
  name: "gak_api_errors_total",
  help: "API errors by endpoint",
  labelNames: ["method", "route", "status"],
  registers: [register]
});

const queueDepthGauge = new client.Gauge({
  name: "gak_queue_depth",
  help: "Queue depth by queue and state",
  labelNames: ["queue", "state"],
  registers: [register]
});

const jobCounter = new client.Counter({
  name: "gak_jobs_total",
  help: "Job lifecycle count",
  labelNames: ["job_type", "status"],
  registers: [register]
});

const jobProcessingMs = new client.Histogram({
  name: "gak_job_processing_ms",
  help: "Job processing duration in milliseconds",
  labelNames: ["job_type", "status"],
  buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000, 60000],
  registers: [register]
});

const cacheCounter = new client.Counter({
  name: "gak_cache_requests_total",
  help: "Cache hits and misses",
  labelNames: ["keyspace", "status"],
  registers: [register]
});

function observeApiRequest({ method, route, status, durationMs }) {
  const labels = {
    method: String(method || "GET"),
    route: String(route || "unknown"),
    status: String(status || 200)
  };
  apiLatencyMs.observe(labels, Number(durationMs || 0));
  if (Number(status || 200) >= 400) {
    apiErrorCount.inc(labels);
  }
}

function observeJob({ jobType, status, durationMs }) {
  const labels = {
    job_type: String(jobType || "unknown"),
    status: String(status || "unknown")
  };
  jobCounter.inc(labels);
  if (Number.isFinite(Number(durationMs))) {
    jobProcessingMs.observe(labels, Number(durationMs));
  }
}

function observeCache({ keyspace, hit }) {
  cacheCounter.inc({
    keyspace: String(keyspace || "unknown"),
    status: hit ? "hit" : "miss"
  });
}

async function exposeMetrics(_req, res, next) {
  try {
    const { syncQueue } = require("../queue/queues");
    const counts = await syncQueue.getJobCounts("waiting", "active", "completed", "failed", "delayed");
    for (const [state, count] of Object.entries(counts)) {
      queueDepthGauge.set({ queue: syncQueue.name, state }, Number(count || 0));
    }
    res.set("Content-Type", register.contentType);
    const body = await register.metrics();
    res.send(body);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  register,
  queueDepthGauge,
  observeApiRequest,
  observeJob,
  observeCache,
  exposeMetrics
};
