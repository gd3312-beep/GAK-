export const API_PREFIX = "/api";

export const syncStatus = {
  SYNCED: "synced",
  PENDING: "pending",
  FAILED: "failed"
} as const;

export const behaviorDomains = ["fitness", "academic", "nutrition"] as const;

export const behaviorActions = ["done", "skipped", "submitted", "missed"] as const;
