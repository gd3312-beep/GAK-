import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().url(),
  GOOGLE_ENCRYPTION_KEY: z.string().min(32),
  APP_ORIGIN: z.string().url().default("http://localhost:5173")
});

export type AppEnv = z.infer<typeof schema>;

export const env: AppEnv = schema.parse(process.env);
