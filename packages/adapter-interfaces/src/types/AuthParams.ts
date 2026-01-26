import { z } from "@hono/zod-openapi";

export enum AuthorizationResponseType {
  TOKEN = "token",
  ID_TOKEN = "id_token",
  TOKEN_ID_TOKEN = "token id_token",
  CODE = "code",
}

export enum AuthorizationResponseMode {
  QUERY = "query",
  FRAGMENT = "fragment",
  FORM_POST = "form_post",
  WEB_MESSAGE = "web_message",
  SAML_POST = "saml_post",
}

export enum CodeChallengeMethod {
  S256 = "S256",
  Plain = "plain",
}

export const authParamsSchema = z.object({
  client_id: z.string(),
  act_as: z.string().optional(),
  response_type: z.nativeEnum(AuthorizationResponseType).optional(),
  response_mode: z.nativeEnum(AuthorizationResponseMode).optional(),
  redirect_uri: z.string().optional(),
  audience: z.string().optional(),
  organization: z.string().optional(),
  state: z.string().optional(),
  nonce: z.string().optional(),
  scope: z.string().optional(),
  prompt: z.string().optional(),
  code_challenge_method: z.nativeEnum(CodeChallengeMethod).optional(),
  code_challenge: z.string().optional(),
  username: z.string().optional(),
  ui_locales: z.string().optional(),
  // OIDC Core 3.1.2.1 - max_age specifies the allowable elapsed time in seconds
  // since the last time the End-User was actively authenticated
  max_age: z.number().optional(),
  // OIDC Core 3.1.2.1 - acr_values is a space-separated string of requested
  // Authentication Context Class Reference values
  acr_values: z.string().optional(),
  // The following fields are not available in Auth0
  vendor_id: z.string().optional(),
});

export type AuthParams = z.infer<typeof authParamsSchema>;
