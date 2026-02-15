import { integrationService } from "../modules/integrations/integration.service";
import { logger } from "../utils/logger";

export async function calendarSyncJob(): Promise<void> {
  const synced = await integrationService.pushPendingCalendarEvents();
  logger.info("Calendar sync job completed", { synced });
}
