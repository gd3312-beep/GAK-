import { BehaviorAction, BehaviorDomain } from "../../types/enums";
import { behaviorService } from "../behavior/behavior.service";
import { integrationService } from "../integrations/integration.service";
import { attendanceRiskLabel } from "./attendance.logic";
import type { AcademicGoalDto, AttendanceDto } from "./academic.types";
import { academicRepository } from "./academic.repository";

class AcademicService {
  async markAttendance(userId: string, input: AttendanceDto) {
    const record = await academicRepository.createAttendance(userId, input);

    await behaviorService.logAction({
      userId,
      domain: BehaviorDomain.ACADEMIC,
      entityId: record.id,
      action: input.attended ? BehaviorAction.DONE : BehaviorAction.MISSED,
      attendancePressure: !input.attended
    });

    return record;
  }

  async createGoal(userId: string, input: AcademicGoalDto) {
    const goal = await academicRepository.createGoal(userId, input);

    await integrationService.createCalendarEvent(userId, {
      title: `Academic goal: ${input.goalType}`,
      startDate: input.deadlineDate,
      endDate: new Date(input.deadlineDate.getTime() + 60 * 60 * 1000),
      domain: "academic"
    });

    return goal;
  }

  async attendanceSummary(userId: string) {
    const stats = await academicRepository.getAttendanceStats(userId);

    return {
      ...stats,
      risk: attendanceRiskLabel(stats.percentage)
    };
  }
}

export const academicService = new AcademicService();
