import { integrationService } from "../modules/integrations/integration.service";
import { logger } from "../utils/logger";

export async function tokenRefreshJob(): Promise<void> {
  const refreshed = await integrationService.refreshGoogleTokens();
  logger.info("Token refresh job completed", { refreshed });
}
