import { BehaviorAction, BehaviorDomain } from "../../types/enums";
import { prisma } from "../../config/database";
import { behaviorRepository } from "./behavior.repository";

export async function recomputeFitnessMetrics(userId: string): Promise<void> {
  const logs = await behaviorRepository.getBehaviorWindow(
    userId,
    BehaviorDomain.FITNESS,
    new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  );

  if (!logs.length) {
    return;
  }

  const skipped = logs.filter((log) => log.action === BehaviorAction.SKIPPED).length;
  const done = logs.filter((log) => log.action === BehaviorAction.DONE).length;
  const total = done + skipped;

  const byHour = new Map<number, number>();
  const byDay = new Map<number, number>();

  for (const log of logs) {
    if (log.action === BehaviorAction.DONE) {
      byHour.set(log.hourOfDay, (byHour.get(log.hourOfDay) ?? 0) + 1);
    }

    if (log.action === BehaviorAction.SKIPPED) {
      byDay.set(log.dayOfWeek, (byDay.get(log.dayOfWeek) ?? 0) + 1);
    }
  }

  const bestTimeSlot = [...byHour.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 6;
  const worstDay = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 1;

  const examWeekLogs = logs.filter((log) => log.examWeek);
  const nonExamWeekLogs = logs.filter((log) => !log.examWeek);
  const examDone = examWeekLogs.filter((log) => log.action === BehaviorAction.DONE).length;
  const nonExamDone = nonExamWeekLogs.filter((log) => log.action === BehaviorAction.DONE).length;

  const examWeekDropPercentage = nonExamDone > 0 ? ((nonExamDone - examDone) / nonExamDone) * 100 : 0;

  await prisma.fitnessBehaviorMetrics.upsert({
    where: { userId },
    create: {
      userId,
      skipRate: total > 0 ? skipped / total : 0,
      consistencyScore: done,
      bestTimeSlot,
      worstDay,
      examWeekDropPercentage,
      lastUpdated: new Date()
    },
    update: {
      skipRate: total > 0 ? skipped / total : 0,
      consistencyScore: done,
      bestTimeSlot,
      worstDay,
      examWeekDropPercentage,
      lastUpdated: new Date()
    }
  });
}
