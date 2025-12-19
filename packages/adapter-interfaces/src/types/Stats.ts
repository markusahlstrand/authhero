import { z } from "@hono/zod-openapi";

export const dailyStatsSchema = z.object({
  date: z.string().openapi({
    description: "Date these events occurred in ISO 8601 format",
    example: "2025-12-19",
  }),
  logins: z.number().openapi({
    description: "Number of logins on this date",
    example: 150,
  }),
  signups: z.number().openapi({
    description: "Number of signups on this date",
    example: 25,
  }),
  leaked_passwords: z.number().openapi({
    description:
      "Number of breached-password detections on this date (subscription required)",
    example: 0,
  }),
  updated_at: z.string().openapi({
    description: "Date and time this stats entry was last updated in ISO 8601 format",
    example: "2025-12-19T10:30:00.000Z",
  }),
  created_at: z.string().openapi({
    description:
      "Approximate date and time the first event occurred in ISO 8601 format",
    example: "2025-12-19T00:00:00.000Z",
  }),
});

export type DailyStats = z.infer<typeof dailyStatsSchema>;

export const activeUsersResponseSchema = z.number().openapi({
  description: "Number of active users in the last 30 days",
  example: 1234,
});

export type ActiveUsersResponse = z.infer<typeof activeUsersResponseSchema>;
