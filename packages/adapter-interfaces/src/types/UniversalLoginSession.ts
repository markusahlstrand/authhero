import { z } from "@hono/zod-openapi";
import { authParamsSchema } from "./AuthParams";

export const universalLoginSessionInsertSchema = z.object({
  id: z.string(),
  expires_at: z.string(),
  auth0Client: z.string().optional(),
  authParams: authParamsSchema,
});

export type UniversalLoginSessionInsert = z.infer<
  typeof universalLoginSessionInsertSchema
>;

export const universalLoginSessionSchema = z.object({
  ...universalLoginSessionInsertSchema.shape,
  created_at: z.string(),
  updated_at: z.string(),
});

export type UniversalLoginSession = z.infer<typeof universalLoginSessionSchema>;
