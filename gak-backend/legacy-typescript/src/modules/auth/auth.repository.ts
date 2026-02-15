import { prisma } from "../../config/database";

type UpsertGoogleUserInput = {
  email: string;
  fullName: string;
  googleId: string;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiry: Date | null;
};

class AuthRepository {
  async upsertGoogleUser(input: UpsertGoogleUserInput) {
    return prisma.appUser.upsert({
      where: { googleId: input.googleId },
      create: {
        email: input.email,
        fullName: input.fullName,
        googleId: input.googleId,
        googleAccessToken: input.accessToken,
        googleRefreshToken: input.refreshToken,
        googleTokenExpiry: input.tokenExpiry
      },
      update: {
        email: input.email,
        fullName: input.fullName,
        googleAccessToken: input.accessToken,
        googleRefreshToken: input.refreshToken,
        googleTokenExpiry: input.tokenExpiry
      }
    });
  }
}

export const authRepository = new AuthRepository();
