import { z } from "@hono/zod-openapi";
import { baseEntitySchema } from "./BaseEntity";
import { identitySchema } from "./Identity";

// OIDC Address Claim schema per OIDC Core 5.1.1
export const addressSchema = z
  .object({
    formatted: z.string().optional(), // Full mailing address
    street_address: z.string().optional(), // Full street address (may be multi-line)
    locality: z.string().optional(), // City or locality
    region: z.string().optional(), // State, province, prefecture, or region
    postal_code: z.string().optional(), // Zip code or postal code
    country: z.string().optional(), // Country name
  })
  .optional();

export type Address = z.infer<typeof addressSchema>;

export const baseUserSchema = z.object({
  email: z
    .string()
    .optional()
    .transform((val) => (val ? val.toLowerCase() : val)),
  username: z.string().optional(),
  phone_number: z.string().optional(),
  phone_verified: z.boolean().optional(), // OIDC phone scope claim (phone_number_verified)
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
  // Additional OIDC profile claims (OIDC Core 5.1)
  middle_name: z.string().optional(),
  preferred_username: z.string().optional(), // Shorthand name the user wishes to be referred to
  profile: z.string().optional(), // URL of profile page
  website: z.string().optional(),
  gender: z.string().optional(),
  birthdate: z.string().optional(), // ISO 8601:2004 YYYY-MM-DD format
  zoneinfo: z.string().optional(), // e.g., "Europe/Paris"
  // OIDC address claim (OIDC Core 5.1.1)
  address: addressSchema,
});

export type BaseUser = z.infer<typeof baseUserSchema>;

export const userInsertSchema = baseUserSchema.extend({
  email_verified: z.boolean().default(false),
  verify_email: z.boolean().optional(),
  last_ip: z.string().optional(),
  last_login: z.string().optional(),
  user_id: z.string().optional(),
  provider: z.string().optional(),
  connection: z.string(),
  is_social: z.boolean().optional(),
});

export type UserInsert = z.infer<typeof userInsertSchema>;

export const userSchema = z.object({
  ...userInsertSchema.shape,
  ...baseEntitySchema.shape,
  user_id: z.string(),
  provider: z.string(),
  is_social: z.boolean(),
  email: z.string().optional(),
  login_count: z.number().default(0),
  identities: z.array(identitySchema).optional(),
});

export type User = z.infer<typeof userSchema>;

// TODO: Add the login_count and other properties
export const auth0UserResponseSchema = userSchema;
