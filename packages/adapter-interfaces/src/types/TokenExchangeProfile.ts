import { z } from "@hono/zod-openapi";
import { jwksKeySchema } from "./JWKS";

/**
 * Custom Token Exchange profiles (Auth0-compatible, issue #1417).
 *
 * A profile maps an RFC 8693 `subject_token_type` to the logic that validates
 * a customer-issued subject token and decides which user the exchange issues
 * tokens for. Auth0 only supports that logic as an Action (`action_id`).
 * AuthHero additionally supports a declarative `jwt_verification` block so the
 * common "verify our signed JWT against our JWKS" case needs no code.
 * Exactly one of `action_id` and `jwt_verification` is set on a profile.
 */

export const TOKEN_EXCHANGE_PROFILE_TYPE = "custom_authentication" as const;

/**
 * Namespaces a profile may not claim. `urn:ietf:params:oauth` holds the
 * standard RFC 8693 token types that AuthHero handles natively; the vendor
 * namespaces are reserved by Auth0.
 */
export const RESERVED_SUBJECT_TOKEN_TYPE_PREFIXES = [
  "urn:ietf:params:oauth:",
  "urn:auth0",
  "urn:okta",
  "http://auth0.com",
  "https://auth0.com",
  "http://okta.com",
  "https://okta.com",
] as const;

export const subjectTokenTypeSchema = z
  .string()
  .min(1)
  .max(200)
  .refine((v) => v.startsWith("https://") || v.startsWith("urn:"), {
    message: "subject_token_type must be a URI starting with https:// or urn:",
  })
  .refine(
    (v) =>
      !RESERVED_SUBJECT_TOKEN_TYPE_PREFIXES.some((prefix) =>
        v.toLowerCase().startsWith(prefix),
      ),
    { message: "subject_token_type uses a reserved namespace" },
  );

export const tokenExchangeJwtAlgorithmSchema = z.enum([
  "RS256",
  "RS384",
  "RS512",
  "ES256",
  "ES384",
  "ES512",
]);
export type TokenExchangeJwtAlgorithm = z.infer<
  typeof tokenExchangeJwtAlgorithmSchema
>;

export const tokenExchangeUserMappingSchema = z.discriminatedUnion("type", [
  z.object({
    // The token's `sub` is the user's id within `connection`. The resulting
    // AuthHero user_id is `<connection strategy>|<sub>`, the same scheme every
    // other connection uses.
    type: z.literal("connection"),
    connection: z.string().min(1),
    // Create the user on first exchange. When false, an unknown `sub` is
    // rejected.
    create_if_not_exists: z.boolean().default(true),
    // Copy the token's `email_verified` onto created users. Off by default:
    // a verified email is what email-based account linking keys on, so
    // trusting it lets the token issuer attach identities to existing
    // accounts. Only enable it when the issuer really verifies emails.
    trust_email_verified: z.boolean().default(false),
  }),
  z.object({
    // The token's `sub` must be an existing AuthHero user_id. Nothing is
    // created.
    type: z.literal("user_id"),
  }),
]);
export type TokenExchangeUserMapping = z.infer<
  typeof tokenExchangeUserMappingSchema
>;

export const tokenExchangeJwtVerificationSchema = z.object({
  // Byte-exact match against the subject token's `iss`.
  issuer: z.string().min(1).max(2048),
  // Exactly one of `jwks` and `jwks_uri` must be set (enforced by the
  // management API, not here, so the schema stays `.partial()`-able).
  jwks: jwksKeySchema.optional(),
  jwks_uri: z.string().url().optional(),
  // Accepted `aud` values. When omitted the tenant's issuer and token
  // endpoint URL are accepted.
  audience: z.array(z.string().min(1)).min(1).optional(),
  // Accepted signing algorithms. Symmetric algorithms are never accepted.
  algorithms: z.array(tokenExchangeJwtAlgorithmSchema).min(1).optional(),
  // Upper bound on `exp - iat`, and on `exp - now`. Keeps a captured subject
  // token short-lived.
  max_lifetime_seconds: z.number().int().min(1).max(3600).default(300),
  // Require a `jti` and accept each value only once.
  require_jti: z.boolean().default(true),
  user_mapping: tokenExchangeUserMappingSchema,
});
export type TokenExchangeJwtVerification = z.infer<
  typeof tokenExchangeJwtVerificationSchema
>;

export const tokenExchangeProfileInsertSchema = z.object({
  name: z.string().min(1).max(255),
  subject_token_type: subjectTokenTypeSchema,
  action_id: z.string().min(1).optional(),
  type: z.literal(TOKEN_EXCHANGE_PROFILE_TYPE),
  // AuthHero extension — see the file header.
  jwt_verification: tokenExchangeJwtVerificationSchema.optional(),
});
export type TokenExchangeProfileInsert = z.input<
  typeof tokenExchangeProfileInsertSchema
>;

export const tokenExchangeProfileSchema =
  tokenExchangeProfileInsertSchema.extend({
    id: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
  });
export type TokenExchangeProfile = z.infer<typeof tokenExchangeProfileSchema>;

// Auth0 allows only `name` and `subject_token_type` to change; the action a
// profile runs is fixed at creation. `jwt_verification` is editable because
// it is configuration, not an identity like `action_id`.
export const tokenExchangeProfileUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  subject_token_type: subjectTokenTypeSchema.optional(),
  jwt_verification: tokenExchangeJwtVerificationSchema.optional(),
});
export type TokenExchangeProfileUpdate = z.input<
  typeof tokenExchangeProfileUpdateSchema
>;
