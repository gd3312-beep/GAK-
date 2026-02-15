import { oauthClient, googleScopes } from "../../config/oauth";
import { encrypt } from "../../utils/encryption.helper";
import { authRepository } from "./auth.repository";

class AuthService {
  getGoogleAuthUrl(): string {
    return oauthClient.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [
        ...googleScopes.auth,
        ...googleScopes.calendar,
        ...googleScopes.fit,
        ...googleScopes.gmailReadonly
      ]
    });
  }

  async handleGoogleCallback(code: string): Promise<{ userId: string }> {
    const { tokens } = await oauthClient.getToken(code);
    oauthClient.setCredentials(tokens);

    const oauth2 = (await import("googleapis")).google.oauth2({
      auth: oauthClient,
      version: "v2"
    });

    const profile = await oauth2.userinfo.get();

    if (!profile.data.id || !profile.data.email) {
      throw new Error("Unable to fetch Google user profile");
    }

    const user = await authRepository.upsertGoogleUser({
      email: profile.data.email,
      fullName: profile.data.name ?? profile.data.email,
      googleId: profile.data.id,
      accessToken: tokens.access_token ? encrypt(tokens.access_token) : null,
      refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
      tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null
    });

    return { userId: user.id };
  }
}

export const authService = new AuthService();
