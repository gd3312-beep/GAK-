import { z } from "zod";

export const createCalendarEventSchema = z.object({
  title: z.string().min(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  domain: z.string().min(1)
});

export type CreateCalendarEventDto = z.infer<typeof createCalendarEventSchema>;
