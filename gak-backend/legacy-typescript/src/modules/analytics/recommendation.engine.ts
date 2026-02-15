import { prisma } from "../../config/database";

export async function regenerateRecommendations(userId: string): Promise<void> {
  const [fitness, academic] = await Promise.all([
    prisma.fitnessBehaviorMetrics.findUnique({ where: { userId } }),
    prisma.academicBehaviorMetrics.findUnique({ where: { userId } })
  ]);

  await prisma.userRecommendation.deleteMany({ where: { userId, acknowledged: false } });

  const recommendations: Array<{ domain: string; recommendationText: string }> = [];

  if (fitness && fitness.skipRate > 0.6) {
    recommendations.push({
      domain: "fitness",
      recommendationText: "High Monday skip tendency detected. Shift sessions to your best completion hour."
    });
  }

  if (fitness && fitness.examWeekDropPercentage > 30) {
    recommendations.push({
      domain: "fitness",
      recommendationText: "Exam-week drop is high. Auto-switch to 20-minute maintenance workouts during exam weeks."
    });
  }

  if (academic && academic.avgAttendance < 0.75) {
    recommendations.push({
      domain: "academic",
      recommendationText: "Attendance is below threshold. Prioritize attendance-critical subjects this week."
    });
  }

  for (const recommendation of recommendations) {
    await prisma.userRecommendation.create({
      data: {
        userId,
        domain: recommendation.domain,
        recommendationText: recommendation.recommendationText
      }
    });
  }
}
