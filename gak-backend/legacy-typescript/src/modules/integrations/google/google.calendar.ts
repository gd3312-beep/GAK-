import { google } from "googleapis";

import { buildOAuthClient } from "./google.auth";

type CalendarAuth = {
  accessToken: string | null;
  refreshToken: string | null;
};

export class GoogleCalendarClient {
  async createEvent(
    auth: CalendarAuth,
    input: { title: string; description?: string; startDate: Date; endDate: Date }
  ): Promise<string> {
    const oauthClient = buildOAuthClient(auth.accessToken, auth.refreshToken);
    const calendar = google.calendar({ version: "v3", auth: oauthClient });

    const result = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: input.title,
        description: input.description,
        start: { dateTime: input.startDate.toISOString() },
        end: { dateTime: input.endDate.toISOString() }
      }
    });

    if (!result.data.id) {
      throw new Error("Google Calendar event creation failed");
    }

    return result.data.id;
  }

  async updateEvent(
    auth: CalendarAuth,
    googleEventId: string,
    input: { title: string; startDate: Date; endDate: Date }
  ): Promise<void> {
    const oauthClient = buildOAuthClient(auth.accessToken, auth.refreshToken);
    const calendar = google.calendar({ version: "v3", auth: oauthClient });

    await calendar.events.update({
      calendarId: "primary",
      eventId: googleEventId,
      requestBody: {
        summary: input.title,
        start: { dateTime: input.startDate.toISOString() },
        end: { dateTime: input.endDate.toISOString() }
      }
    });
  }

  async deleteEvent(auth: CalendarAuth, googleEventId: string): Promise<void> {
    const oauthClient = buildOAuthClient(auth.accessToken, auth.refreshToken);
    const calendar = google.calendar({ version: "v3", auth: oauthClient });

    await calendar.events.delete({
      calendarId: "primary",
      eventId: googleEventId
    });
  }
}
