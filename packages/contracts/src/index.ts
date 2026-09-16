import { z } from "zod";

// JSON arrives at runtime, after TypeScript's compile-time checks are gone.
export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string().min(1),
  checkedAt: z.iso.datetime(),
  message: z.string()
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export type ApiError = {
  error: { code: string; message: string };
};
