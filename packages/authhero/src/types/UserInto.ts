import { z } from "@hono/zod-openapi";

export const userInfoSchema = z.object({
  sub: z.string(),
  email: z.string().optional(),
  family_name: z.string().optional(),
  given_name: z.string().optional(),
  email_verified: z.boolean(),
});
