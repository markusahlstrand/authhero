import { z } from "@hono/zod-openapi";

export const passwordInsertSchema = z.object({
  id: z.string().optional(),
  user_id: z.string(),
  password: z.string(),
  algorithm: z.enum(["bcrypt", "argon2id"]).default("argon2id"),
  is_current: z.boolean().default(true),
});

export type PasswordInsert = z.infer<typeof passwordInsertSchema>;

export const passwordSchema = passwordInsertSchema.extend({
  id: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type Password = z.infer<typeof passwordSchema>;
