import { prisma } from "../../config/database";
import type { UpdateUserDto } from "./user.types";

class UserRepository {
  async findById(userId: string) {
    return prisma.appUser.findUnique({
      where: { id: userId },
      include: {
        bodyMetrics: {
          orderBy: { recordedTimestamp: "desc" },
          take: 1
        }
      }
    });
  }

  async updateProfile(userId: string, input: UpdateUserDto) {
    const updated = await prisma.appUser.update({
      where: { id: userId },
      data: {
        fullName: input.fullName
      }
    });

    if (input.heightCm || input.weightKg) {
      await prisma.bodyMetric.create({
        data: {
          userId,
          height: input.heightCm,
          weight: input.weightKg
        }
      });
    }

    return updated;
  }
}

export const userRepository = new UserRepository();
