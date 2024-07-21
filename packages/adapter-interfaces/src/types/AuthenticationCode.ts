import { z } from "@hono/zod-openapi";
import { authParamsSchema } from "./AuthParams";

export const authenticationCodeInsertSchema = z.object({
  authParams: authParamsSchema,
  code: z.string(),
  user_id: z.string(),
  created_at: z.string(),
  expires_at: z.string(),
  used_at: z.string().optional(),
});

export type AuthenticationCodeInsert = z.infer<
  typeof authenticationCodeInsertSchema
>;

export const authenticationCodeSchema = z.object({
  ...authenticationCodeInsertSchema.shape,
  created_at: z.string(),
});

export type AuthenticationCode = z.infer<typeof authenticationCodeSchema>;
