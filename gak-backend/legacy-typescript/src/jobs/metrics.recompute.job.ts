import { behaviorService } from "../modules/behavior/behavior.service";
import { summaryService } from "../modules/analytics/summary.service";
import { logger } from "../utils/logger";

export async function metricsRecomputeJob(): Promise<void> {
  await behaviorService.recomputeAllMetrics();
  await summaryService.recomputeAllSummaries();
  logger.info("Metrics recompute job completed");
}
