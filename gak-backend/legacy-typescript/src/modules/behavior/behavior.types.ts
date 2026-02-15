import { z } from "zod";

export const behaviorLogSchema = z.object({
  domain: z.enum(["fitness", "academic", "nutrition"]),
  entityId: z.string().min(1),
  action: z.enum(["done", "skipped", "submitted", "missed"])
});

export type BehaviorLogDto = z.infer<typeof behaviorLogSchema>;
