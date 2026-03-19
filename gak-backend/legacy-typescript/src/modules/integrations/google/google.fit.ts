import { google } from "googleapis";

import { buildOAuthClient } from "./google.auth";

type FitAuth = {
  accessToken: string | null;
  refreshToken: string | null;
};

export class GoogleFitClient {
  async pushWorkoutSession(
    auth: FitAuth,
    input: { sessionId: string; startTime: Date; endTime: Date; calories: number }
  ): Promise<string> {
    const oauthClient = buildOAuthClient(auth.accessToken, auth.refreshToken);
    const fitness = google.fitness({ version: "v1", auth: oauthClient });

    await fitness.users.sessions.update({
      userId: "me",
      sessionId: input.sessionId,
      requestBody: {
        id: input.sessionId,
        name: "GAK Workout",
        description: `Calories: ${input.calories}`,
        startTimeMillis: String(input.startTime.getTime()),
        endTimeMillis: String(input.endTime.getTime()),
        application: {
          name: "GAK",
          version: "1.0"
        },
        activityType: 8
      }
    });

    return input.sessionId;
  }
}
