import { z } from "zod";

export const EnvironmentSchema = z.enum(["demo", "real"]);
export type Environment = z.infer<typeof EnvironmentSchema>;

export const ConfigSchema = z.object({
  apiKey: z.string().min(1, "ETORO_API_KEY is required"),
  userKey: z.string().min(1, "ETORO_USER_KEY is required"),
  environment: EnvironmentSchema.default("demo"),
});

export type EtoroConfig = z.infer<typeof ConfigSchema>;
