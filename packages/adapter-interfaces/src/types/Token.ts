import { z } from "@hono/zod-openapi";

export enum GrantType {
  RefreshToken = "refresh_token",
  AuthorizationCode = "authorization_code",
  ClientCredential = "client_credentials",
  Passwordless = "passwordless",
  Password = "password",
  OTP = "http://auth0.com/oauth/grant-type/passwordless/otp",
}

export const tokenResponseSchema = z.object({
  access_token: z.string(),
  id_token: z.string().optional(),
  scope: z.string().optional(),
  state: z.string().optional(),
  refresh_token: z.string().optional(),
  token_type: z.string(),
  expires_in: z.number(),
});
export type TokenResponse = z.infer<typeof tokenResponseSchema>;

const codeResponseSchema = z.object({
  code: z.string(),
  state: z.string().optional(),
});
export type CodeResponse = z.infer<typeof codeResponseSchema>;
