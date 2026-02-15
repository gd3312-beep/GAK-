import { google } from "googleapis";

import { buildOAuthClient } from "./google.auth";

type GmailAuth = {
  accessToken: string | null;
  refreshToken: string | null;
};

export class GoogleGmailClient {
  async fetchUnreadMessages(auth: GmailAuth): Promise<Array<{ id: string; subject: string; snippet: string }>> {
    const oauthClient = buildOAuthClient(auth.accessToken, auth.refreshToken);
    const gmail = google.gmail({ version: "v1", auth: oauthClient });

    const listResponse = await gmail.users.messages.list({ userId: "me", q: "is:unread" });
    const ids = listResponse.data.messages?.map((message) => message.id).filter(Boolean) as string[];

    if (!ids.length) {
      return [];
    }

    const messages = await Promise.all(
      ids.map(async (id) => {
        const message = await gmail.users.messages.get({ userId: "me", id });
        const subjectHeader = message.data.payload?.headers?.find(
          (header) => header.name?.toLowerCase() === "subject"
        );

        return {
          id,
          subject: subjectHeader?.value ?? "",
          snippet: message.data.snippet ?? ""
        };
      })
    );

    return messages;
  }
}
