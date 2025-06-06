import { HTTPException } from "hono/http-exception";
import { Context } from "hono";
import { z } from "@hono/zod-openapi";
import { createAuthResponse } from "./common";
import { Bindings, Variables } from "../types";
import { computeCodeChallenge } from "../utils/crypto";
import { safeCompare } from "../utils/safe-compare";
import {
  AuthorizationResponseMode,
  TokenResponse,
} from "@authhero/adapter-interfaces";

export const authorizationCodeGrantParamsSchema = z
  .object({
    grant_type: z.literal("authorization_code"),
    client_id: z.string(),
    code: z.string(),
    redirect_uri: z.string().optional(),
    client_secret: z.string().optional(),
    code_verifier: z.string().optional(),
  })
  .refine(
    (data) => {
      // Must have either client_secret (standard) or code_verifier (PKCE)
      return (
        ("client_secret" in data && !("code_verifier" in data)) ||
        (!("client_secret" in data) && "code_verifier" in data)
      );
    },
    {
      message:
        "Must provide either client_secret (standard flow) or code_verifier/code_verifier_mode (PKCE flow), but not both",
    },
  );

export type AuthorizationCodeGrantTypeParams = z.infer<
  typeof authorizationCodeGrantParamsSchema
>;

export async function authorizationCodeGrant(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: AuthorizationCodeGrantTypeParams,
): Promise<TokenResponse | Response> {
  const client = await ctx.env.data.clients.get(params.client_id);
  if (!client) {
    throw new HTTPException(403, { message: "Client not found" });
  }

  const code = await ctx.env.data.codes.get(
    client.tenant.id,
    params.code,
    "authorization_code",
  );

  if (!code || !code.user_id) {
    throw new HTTPException(403, { message: "Invalid client credentials" });
  } else if (new Date(code.expires_at) < new Date()) {
    throw new HTTPException(403, { message: "Code expired" });
  } else if (code.used_at) {
    throw new HTTPException(403, { message: "Code already used" });
  }

  const loginSession = await ctx.env.data.loginSessions.get(
    client.tenant.id,
    code.login_id,
  );

  if (!loginSession) {
    throw new HTTPException(403, { message: "Invalid login" });
  }

  // Validate the secret or PKCE
  if ("client_secret" in params) {
    // A temporary solution to handle cross tenant clients
    const defaultClient = await ctx.env.data.clients.get("DEFAULT_CLIENT");

    // Code flow
    if (
      !safeCompare(client.client_secret, params.client_secret) &&
      !safeCompare(defaultClient?.client_secret, params.client_secret)
    ) {
      throw new HTTPException(403, { message: "Invalid client credentials" });
    }
  } else if (
    code.code_challenge &&
    code.code_challenge_method &&
    params.code_verifier
  ) {
    // PKCE flow
    const challenge = await computeCodeChallenge(
      params.code_verifier,
      code.code_challenge_method,
    );
    if (!safeCompare(challenge, code.code_challenge)) {
      throw new HTTPException(403, { message: "Invalid client credentials" });
    }
  }

  // Validate the redirect_uri
  if (code.redirect_uri && code.redirect_uri !== params.redirect_uri) {
    throw new HTTPException(403, { message: "Invalid redirect uri" });
  }

  const user = await ctx.env.data.users.get(client.tenant.id, code.user_id);
  if (!user) {
    throw new HTTPException(403, { message: "User not found" });
  }

  await ctx.env.data.codes.used(client.tenant.id, params.code);

  // createAuthResponse will handle returning TokenResponse directly for WEB_MESSAGE
  // or a full Response for other cases (though not expected here due to fixed response_mode)
  return createAuthResponse(ctx, {
    user,
    client,
    loginSession,
    authParams: {
      ...loginSession.authParams,
      // Use the state and nonce from the code as it might differ if it's a silent auth login
      state: code.state,
      nonce: code.nonce,
      // Ensure WEB_MESSAGE is explicitly passed, as createAuthResponse relies on it
      response_mode: AuthorizationResponseMode.WEB_MESSAGE,
      // Pass through other relevant authParams from the loginSession or original request if necessary
      // For authorization_code grant, these are usually fixed or derived, not directly from params
      client_id: client.id, // ensure client_id is from the validated client
      scope: loginSession.authParams.scope, // scope from original authorization request
      audience: loginSession.authParams.audience, // audience from original authorization request
    },
  });
}
