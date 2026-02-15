import { prisma } from "../config/database";
import { integrationService } from "../modules/integrations/integration.service";
import { logger } from "../utils/logger";

export async function gmailSyncJob(): Promise<void> {
  const users = await prisma.appUser.findMany({
    where: {
      googleRefreshToken: { not: null }
    },
    select: { id: true }
  });

  for (const user of users) {
    const processed = await integrationService.parseGmailForAcademicEvents(user.id);
    logger.info("Gmail sync processed", { userId: user.id, processed });
  }
}
