import { z } from "zod";

export const attendanceSchema = z.object({
  subjectId: z.string().min(1),
  timetableEntryId: z.string().min(1),
  classDate: z.coerce.date(),
  attended: z.boolean()
});

export const academicGoalSchema = z.object({
  subjectId: z.string().min(1),
  goalType: z.string().min(1),
  targetValue: z.number().positive(),
  deadlineDate: z.coerce.date(),
  status: z.enum(["active", "completed", "paused"]).default("active")
});

export type AttendanceDto = z.infer<typeof attendanceSchema>;
export type AcademicGoalDto = z.infer<typeof academicGoalSchema>;
