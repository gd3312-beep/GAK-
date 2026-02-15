import { randomUUID } from "crypto";

import { prisma } from "../../config/database";
import type { AcademicGoalDto, AttendanceDto } from "./academic.types";

class AcademicRepository {
  async createAttendance(userId: string, input: AttendanceDto) {
    return prisma.attendanceRecord.create({
      data: {
        id: randomUUID(),
        userId,
        subjectId: input.subjectId,
        timetableEntryId: input.timetableEntryId,
        classDate: input.classDate,
        attended: input.attended
      }
    });
  }

  async createGoal(userId: string, input: AcademicGoalDto) {
    return prisma.academicGoal.create({
      data: {
        id: randomUUID(),
        userId,
        subjectId: input.subjectId,
        goalType: input.goalType,
        targetValue: input.targetValue,
        deadlineDate: input.deadlineDate,
        status: input.status
      }
    });
  }

  async getAttendanceStats(userId: string) {
    const records = await prisma.attendanceRecord.findMany({ where: { userId } });
    const attended = records.filter((record) => record.attended).length;

    return {
      total: records.length,
      attended,
      percentage: records.length ? attended / records.length : 0
    };
  }
}

export const academicRepository = new AcademicRepository();
