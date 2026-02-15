import { z } from "zod";

export const completeOnboardingSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email()
});

export type CompleteOnboardingDto = z.infer<typeof completeOnboardingSchema>;
