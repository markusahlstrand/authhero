import { z } from "@hono/zod-openapi";

export const codeTypeSchema = z.enum([
  "password_reset",
  "email_verification",
  "otp",
  "mfa_otp",
  "authorization_code",
  "oauth2_state",
  "ticket",
  // Single-use marker for an RFC 7523 client-assertion `jti`. Unlike every
  // other code type this is not a credential we issued — it is a record that a
  // client-presented assertion has been spent, so it is stored already used
  // and only exists until the assertion it guards expires.
  "client_assertion_jti",
]);
export type CodeType = z.infer<typeof codeTypeSchema>;

export const codeInsertSchema = z.object({
  code_id: z.string().openapi({
    description:
      "The code that will be used in for instance an email verification flow",
  }),
  // Optional: every code type issued during a login flow carries one, but
  // `client_assertion_jti` rows are created at the token endpoint where there
  // is no login session. The column is already nullable in every adapter.
  login_id: z.string().optional().openapi({
    description: "The id of the login session that the code is connected to",
  }),
  connection_id: z.string().optional().openapi({
    description: "The connection that the code is connected to",
  }),
  code_type: codeTypeSchema,
  code_verifier: z.string().optional().openapi({
    description: "The code verifier used in PKCE in outbound flows",
  }),
  code_challenge: z.string().optional().openapi({
    description: "The code challenge used in PKCE in outbound flows",
  }),
  code_challenge_method: z.enum(["plain", "S256"]).optional().openapi({
    description: "The code challenge method used in PKCE in outbound flows",
  }),
  redirect_uri: z.string().optional().openapi({
    description: "The redirect URI associated with the code",
  }),
  otp: z.string().optional().openapi({
    description: "The one-time password value for OTP-based flows",
  }),
  nonce: z.string().optional().openapi({
    description: "The nonce value used for security in OIDC flows",
  }),
  state: z.string().optional().openapi({
    description: "The state parameter used for CSRF protection in OAuth flows",
  }),
  expires_at: z.string(),
  used_at: z.string().optional(),
  user_id: z.string().optional(),
});

export type CodeInsert = z.infer<typeof codeInsertSchema>;

export const codeSchema = codeInsertSchema.extend({
  created_at: z.string(),
});

export type Code = z.infer<typeof codeSchema>;
