import { z } from "@hono/zod-openapi";
import { baseEntitySchema } from "./BaseEntity";
import { identitySchema } from "./Identity";

export const baseUserSchema = z.object({
  email: z.string().optional(),
  username: z.string().optional(),
  given_name: z.string().optional(),
  family_name: z.string().optional(),
  nickname: z.string().optional(),
  name: z.string().optional(),
  picture: z.string().optional(),
  locale: z.string().optional(),
  linked_to: z.string().optional(),
  profileData: z.string().optional(),
  user_id: z.string().optional(),
  app_metadata: z.any().default({}).optional(),
  user_metadata: z.any().default({}).optional(),
});

export type BaseUser = z.infer<typeof baseUserSchema>;

export const userInsertSchema = baseUserSchema.extend({
  email_verified: z.boolean().default(false),
  verify_email: z.boolean().optional(),
  last_ip: z.string().optional(),
  last_login: z.string().optional(),
  user_id: z.string().optional(),
  provider: z.string().default("email"),
  connection: z.string().default("email"),
  is_social: z.boolean().optional(),
});

export type UserInsert = z.infer<typeof userInsertSchema>;

export const userSchema = z.object({
  ...userInsertSchema.shape,
  ...baseEntitySchema.shape,
  user_id: z.string(),
  is_social: z.boolean(),
  // TODO: this not might be correct if you use the username
  email: z.string().optional(),
  login_count: z.number(),
  identities: z.array(identitySchema).optional(),
});

export type User = z.infer<typeof userSchema>;

// TODO: Add the login_count and other properties
export const auth0UserResponseSchema = userSchema;
