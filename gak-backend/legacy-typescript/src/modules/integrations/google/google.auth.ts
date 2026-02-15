import { google, type Auth } from "googleapis";

import { decrypt } from "../../../utils/encryption.helper";
import { env } from "../../../config/env";

export function buildOAuthClient(encryptedAccessToken?: string | null, encryptedRefreshToken?: string | null): Auth.OAuth2Client {
  const client = new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_OAUTH_REDIRECT_URI
  );

  client.setCredentials({
    access_token: encryptedAccessToken ? decrypt(encryptedAccessToken) : undefined,
    refresh_token: encryptedRefreshToken ? decrypt(encryptedRefreshToken) : undefined
  });

  return client;
}
