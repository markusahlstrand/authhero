import { HTTPException } from "hono/http-exception";
import { Context } from "hono";
import { z } from "@hono/zod-openapi";
import { createAuthTokens } from "./common";
import { Bindings, Variables } from "../types";
import { computeCodeChallenge } from "../utils/crypto";

export const authorizationCodeGrantParamsSchema = z
  .object({
    grant_type: z.literal("authorization_code"),
    client_id: z.string(),
    code: z.string(),
    redirect_uri: z.string(),
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
) {
  const client = await ctx.env.data.clients.get(params.client_id);

  if (!client) {
    throw new HTTPException(403, { message: "Invalid client credentials" });
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
  }

  const login = await ctx.env.data.logins.get(client.tenant.id, code.login_id);
  if (!login) {
    throw new HTTPException(403, { message: "Invalid login" });
  }

  // Validate the secret or PKCE
  if ("client_secret" in params) {
    // Code flow
    if (client.client_secret !== params.client_secret) {
      throw new HTTPException(403, { message: "Invalid client credentials" });
    }
  } else if (
    "code_verifier" in params &&
    typeof params.code_verifier === "string" &&
    "code_challenge_method" in login.authParams &&
    typeof login.authParams.code_challenge_method === "string"
  ) {
    // PKCE flow
    const challenge = await computeCodeChallenge(
      params.code_verifier,
      login.authParams.code_challenge_method,
    );

    if (challenge !== login.authParams.code_challenge) {
      throw new HTTPException(403, { message: "Invalid client credentials" });
    }
  }

  // Validate the redirect_uri
  if (
    login.authParams.redirect_uri &&
    login.authParams.redirect_uri !== params.redirect_uri
  ) {
    throw new HTTPException(403, { message: "Invalid redirect uri" });
  }

  const user = await ctx.env.data.users.get(client.tenant.id, code.user_id);
  if (!user) {
    throw new HTTPException(403, { message: "User not found" });
  }

  await ctx.env.data.codes.remove(client.tenant.id, params.code);

  return createAuthTokens(ctx, { authParams: login.authParams, user });
}