import { google } from "googleapis";

import { env } from "./env";

export const googleScopes = {
  auth: ["openid", "email", "profile"],
  calendar: ["https://www.googleapis.com/auth/calendar"],
  gmailReadonly: ["https://www.googleapis.com/auth/gmail.readonly"],
  fit: [
    "https://www.googleapis.com/auth/fitness.activity.write",
    "https://www.googleapis.com/auth/fitness.activity.read"
  ]
};

export const oauthClient = new google.auth.OAuth2(
  env.GOOGLE_CLIENT_ID,
  env.GOOGLE_CLIENT_SECRET,
  env.GOOGLE_OAUTH_REDIRECT_URI
);
