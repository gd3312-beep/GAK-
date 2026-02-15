import cron from "node-cron";

import { calendarSyncJob } from "./calendar.sync.job";
import { gmailSyncJob } from "./gmail.sync.job";
import { metricsRecomputeJob } from "./metrics.recompute.job";
import { tokenRefreshJob } from "./token.refresh.job";

export function bootstrapJobs(): void {
  cron.schedule("*/10 * * * *", () => {
    void gmailSyncJob();
  });

  cron.schedule("0 * * * *", () => {
    void tokenRefreshJob();
  });

  cron.schedule("15 * * * *", () => {
    void calendarSyncJob();
  });

  cron.schedule("0 2 * * *", () => {
    void metricsRecomputeJob();
  });
}
