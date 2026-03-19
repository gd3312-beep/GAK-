import { prisma } from "../../config/database";

export async function recomputeAcademicMetrics(userId: string): Promise<void> {
  const attendance = await prisma.attendanceRecord.findMany({ where: { userId } });
  const marks = await prisma.marksRecord.findMany({ where: { userId } });

  const attended = attendance.filter((item) => item.attended).length;
  const avgAttendance = attendance.length ? attended / attendance.length : 0;

  const riskSubjectCount = new Set(
    attendance
      .filter((item) => !item.attended)
      .map((item) => item.subjectId)
  ).size;

  const avgMarkPercent = marks.length
    ? marks.reduce((acc, mark) => acc + (mark.maxScore > 0 ? mark.score / mark.maxScore : 0), 0) / marks.length
    : 0;

  const examWeekStressIndex = riskSubjectCount * (1 - avgAttendance);
  const goalAdherenceScore = avgMarkPercent * avgAttendance;

  await prisma.academicBehaviorMetrics.upsert({
    where: { userId },
    create: {
      userId,
      avgAttendance,
      riskSubjectCount,
      examWeekStressIndex,
      goalAdherenceScore,
      lastUpdated: new Date()
    },
    update: {
      avgAttendance,
      riskSubjectCount,
      examWeekStressIndex,
      goalAdherenceScore,
      lastUpdated: new Date()
    }
  });
}
