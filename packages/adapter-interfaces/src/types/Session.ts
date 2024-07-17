import { z } from "@hono/zod-openapi";

export const sessionInsertSchema = z.object({
  session_id: z.string(),
  client_id: z.string(),
  expires_at: z.string(),
  used_at: z.string(),
  deleted_at: z.string().optional(),
  user_id: z.string(),
});

export type SessionInsert = z.infer<typeof sessionInsertSchema>;

const sessionSchema = z.object({
  created_at: z.string(),
  ...sessionInsertSchema.shape,
});

export type Session = z.infer<typeof sessionSchema>;
