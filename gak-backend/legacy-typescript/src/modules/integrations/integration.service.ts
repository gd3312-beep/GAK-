import { SyncStatus } from "../../types/enums";
import { logger } from "../../utils/logger";
import { matchesAcademicKeywords, extractDeadline } from "../../utils/parser.helper";
import { GoogleCalendarClient } from "./google/google.calendar";
import { GoogleFitClient } from "./google/google.fit";
import { GoogleGmailClient } from "./google/google.gmail";
import { integrationRepository } from "./integration.repository";
import type { CreateCalendarEventDto } from "./integration.types";

const calendarClient = new GoogleCalendarClient();
const fitClient = new GoogleFitClient();
const gmailClient = new GoogleGmailClient();

class IntegrationService {
  async createCalendarEvent(userId: string, payload: CreateCalendarEventDto) {
    const tokens = await integrationRepository.getUserGoogleTokens(userId);

    const googleEventId = await calendarClient.createEvent(
      {
        accessToken: tokens.googleAccessToken,
        refreshToken: tokens.googleRefreshToken
      },
      {
        title: payload.title,
        startDate: payload.startDate,
        endDate: payload.endDate
      }
    );

    return integrationRepository.createCalendarEvent({
      userId,
      title: payload.title,
      eventDate: payload.startDate,
      eventType: payload.domain,
      googleEventId,
      syncStatus: SyncStatus.SYNCED
    });
  }

  async pushWorkoutToGoogleFit(userId: string, workoutSessionId: string): Promise<void> {
    const [tokens, session] = await Promise.all([
      integrationRepository.getUserGoogleTokens(userId),
      integrationRepository.getWorkoutSession(workoutSessionId)
    ]);

    const startTime = new Date(session.workoutDate);
    const endTime = new Date(startTime.getTime() + session.durationMinutes * 60 * 1000);

    const externalId = await fitClient.pushWorkoutSession(
      {
        accessToken: tokens.googleAccessToken,
        refreshToken: tokens.googleRefreshToken
      },
      {
        sessionId: workoutSessionId,
        startTime,
        endTime,
        calories: session.caloriesBurned
      }
    );

    await integrationRepository.setWorkoutSync(workoutSessionId, externalId);
  }

  async parseGmailForAcademicEvents(userId: string): Promise<number> {
    const tokens = await integrationRepository.getUserGoogleTokens(userId);
    const messages = await gmailClient.fetchUnreadMessages({
      accessToken: tokens.googleAccessToken,
      refreshToken: tokens.googleRefreshToken
    });

    let processed = 0;

    for (const message of messages) {
      if (!matchesAcademicKeywords(message.subject)) {
        continue;
      }

      const deadline = extractDeadline(`${message.subject} ${message.snippet}`);

      if (!deadline) {
        await integrationRepository.createEmailEvent({
          userId,
          subject: message.subject,
          confidenceScore: 0.2
        });
        continue;
      }

      await integrationRepository.createEmailEvent({
        userId,
        subject: message.subject,
        parsedDeadline: deadline,
        confidenceScore: 0.9
      });

      await this.createCalendarEvent(userId, {
        title: message.subject,
        startDate: deadline,
        endDate: new Date(deadline.getTime() + 60 * 60 * 1000),
        domain: "academic"
      });

      processed += 1;
    }

    logger.info("Gmail parsing complete", { userId, processed });
    return processed;
  }

  async pushPendingCalendarEvents(): Promise<number> {
    const pending = await integrationRepository.getPendingCalendarEvents();

    for (const event of pending) {
      try {
        await this.createCalendarEvent(event.userId, {
          title: event.title,
          startDate: event.eventDate,
          endDate: new Date(event.eventDate.getTime() + 60 * 60 * 1000),
          domain: event.eventType
        });

        await integrationRepository.updateCalendarEventStatus(event.id, SyncStatus.SYNCED);
      } catch (error) {
        await integrationRepository.updateCalendarEventStatus(event.id, SyncStatus.FAILED);
        logger.warn("Calendar sync failed", { eventId: event.id, error });
      }
    }

    return pending.length;
  }

  async refreshGoogleTokens(): Promise<number> {
    // Placeholder: in production, refresh via oauth2 token endpoint and persist new access token.
    const users = await integrationRepository.getUsersWithGoogleRefreshToken();
    return users.length;
  }
}

export const integrationService = new IntegrationService();
