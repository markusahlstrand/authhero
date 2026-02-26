import { z } from "@hono/zod-openapi";

export const profileDataSchema = z
  .object({
    email: z.string().optional(),
    email_verified: z.boolean().optional(),
    name: z.string().optional(),
    username: z.string().optional(),
    given_name: z.string().optional(),
    phone_number: z.string().optional(),
    phone_verified: z.boolean().optional(),
    family_name: z.string().optional(),
  })
  .catchall(z.any());

export const identitySchema = z.object({
  connection: z.string(),
  user_id: z.string(),
  provider: z.string(),
  isSocial: z.boolean(),
  email: z.string().optional(),
  email_verified: z.boolean().optional(),
  phone_number: z.string().optional(),
  phone_verified: z.boolean().optional(),
  username: z.string().optional(),
  access_token: z.string().optional(),
  access_token_secret: z.string().optional(),
  refresh_token: z.string().optional(),
  profileData: profileDataSchema.optional(),
});

export type Identity = z.infer<typeof identitySchema>;
