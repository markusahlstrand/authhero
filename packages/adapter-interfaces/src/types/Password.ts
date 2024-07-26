import { z } from "@hono/zod-openapi";

export const passwordInsertSchema = z.object({
  user_id: z.string(),
  password: z.string(),
  algorithm: z.enum(["bcrypt", "argon2id"]).default("argon2id"),
});

export type PasswordInsert = z.infer<typeof passwordInsertSchema>;

export const passwordSchema = z.object({
  ...passwordInsertSchema.shape,
  created_at: z.string(),
  updated_at: z.string(),
});

export type Password = z.infer<typeof passwordSchema>;
