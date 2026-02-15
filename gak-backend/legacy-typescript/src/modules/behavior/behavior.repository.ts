import { prisma } from "../../config/database";
import { BehaviorAction, BehaviorDomain } from "../../types/enums";

type LogBehaviorInput = {
  userId: string;
  domain: BehaviorDomain;
  entityId: string;
  action: BehaviorAction;
  timestamp: Date;
  examWeek: boolean;
  attendancePressure: boolean;
};

class BehaviorRepository {
  async logBehavior(input: LogBehaviorInput) {
    return prisma.userBehaviorLog.create({
      data: {
        userId: input.userId,
        domain: input.domain,
        entityId: input.entityId,
        action: input.action,
        timestamp: input.timestamp,
        dayOfWeek: input.timestamp.getDay(),
        hourOfDay: input.timestamp.getHours(),
        examWeek: input.examWeek,
        attendancePressure: input.attendancePressure
      }
    });
  }

  async getBehaviorWindow(userId: string, domain: BehaviorDomain, since: Date) {
    return prisma.userBehaviorLog.findMany({
      where: {
        userId,
        domain,
        timestamp: { gte: since }
      }
    });
  }

  async getAllUsers(): Promise<string[]> {
    const users = await prisma.appUser.findMany({ select: { id: true } });
    return users.map((user) => user.id);
  }
}

export const behaviorRepository = new BehaviorRepository();
