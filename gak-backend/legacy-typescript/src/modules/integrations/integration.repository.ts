import { prisma } from "../../config/database";
import { SyncStatus } from "../../types/enums";

class IntegrationRepository {
  async getUserGoogleTokens(userId: string) {
    return prisma.appUser.findUniqueOrThrow({
      where: { id: userId },
      select: {
        googleAccessToken: true,
        googleRefreshToken: true
      }
    });
  }

  async createCalendarEvent(input: {
    userId: string;
    title: string;
    eventDate: Date;
    eventType: string;
    googleEventId?: string;
    syncStatus?: SyncStatus;
  }) {
    return prisma.calendarEvent.create({
      data: {
        userId: input.userId,
        title: input.title,
        eventDate: input.eventDate,
        eventType: input.eventType,
        googleEventId: input.googleEventId,
        syncStatus: input.syncStatus ?? SyncStatus.PENDING
      }
    });
  }

  async updateCalendarEventStatus(eventId: string, syncStatus: SyncStatus) {
    return prisma.calendarEvent.update({
      where: { id: eventId },
      data: { syncStatus }
    });
  }

  async getPendingCalendarEvents() {
    return prisma.calendarEvent.findMany({ where: { syncStatus: SyncStatus.PENDING } });
  }

  async getWorkoutSession(workoutSessionId: string) {
    return prisma.workoutSession.findUniqueOrThrow({ where: { id: workoutSessionId } });
  }

  async setWorkoutSync(workoutSessionId: string, googleFitSessionId: string) {
    return prisma.workoutSession.update({
      where: { id: workoutSessionId },
      data: {
        googleFitSessionId,
        syncStatus: SyncStatus.SYNCED
      }
    });
  }

  async createEmailEvent(input: {
    userId: string;
    subject: string;
    parsedDeadline?: Date;
    confidenceScore: number;
  }) {
    return prisma.emailEvent.create({
      data: {
        userId: input.userId,
        subject: input.subject,
        parsedDeadline: input.parsedDeadline,
        source: "gmail",
        confidenceScore: input.confidenceScore
      }
    });
  }

  async getUsersWithGoogleRefreshToken() {
    return prisma.appUser.findMany({
      where: { googleRefreshToken: { not: null } },
      select: { id: true }
    });
  }
}

export const integrationRepository = new IntegrationRepository();
