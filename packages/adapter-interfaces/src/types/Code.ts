import { z } from "@hono/zod-openapi";
import { CodeChallengeMethod } from "./AuthParams";

export const codeTypeSchema = z.enum([
  "password_reset",
  "email_verification",
  "otp",
  "authorization_code",
  "oauth2_state",
  "ticket",
]);
export type CodeType = z.infer<typeof codeTypeSchema>;

export const codeInsertSchema = z.object({
  code_id: z.string().openapi({
    description:
      "The code that will be used in for instance an email verification flow",
  }),
  login_id: z.string().openapi({
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
  code_challenge_method: z.nativeEnum(CodeChallengeMethod).optional().openapi({
    description: "The code challenge method used in PKCE in outbound flows",
  }),
  redirect_uri: z.string().optional().openapi({
    description: "The redirect URI associated with the code",
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

export const codeSchema = z.object({
  ...codeInsertSchema.shape,
  created_at: z.string(),
});

export type Code = z.infer<typeof codeSchema>;
