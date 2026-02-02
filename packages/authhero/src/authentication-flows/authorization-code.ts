import { Context } from "hono";
import { z } from "@hono/zod-openapi";
import { JSONHTTPException } from "../errors/json-http-exception";
import { createFrontChannelAuthResponse, createRefreshToken } from "./common";
import { Bindings, Variables } from "../types";
import { computeCodeChallenge } from "../utils/crypto";
import { safeCompare } from "../utils/safe-compare";
import {
  AuthorizationResponseMode,
  RefreshToken,
  TokenResponse,
  LogTypes,
} from "@authhero/adapter-interfaces";
import { GrantFlowUserResult } from "src/types/GrantFlowResult";
import { logMessage } from "../helpers/logging";
import { getEnrichedClient } from "../helpers/client";

export const authorizationCodeGrantParamsSchema = z
  .object({
    grant_type: z.literal("authorization_code"),
    client_id: z.string(),
    code: z.string(),
    redirect_uri: z.string().optional(),
    client_secret: z.string().optional(),
    code_verifier: z.string().optional(),
    organization: z.string().optional(),
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

// This is a new version that just returns the user
export async function authorizationCodeGrantUser(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: AuthorizationCodeGrantTypeParams,
): Promise<GrantFlowUserResult> {
  const client = await getEnrichedClient(
    ctx.env,
    params.client_id,
    ctx.var.tenant_id,
  );

  const code = await ctx.env.data.codes.get(
    client.tenant.id,
    params.code,
    "authorization_code",
  );

  if (!code || !code.user_id) {
    logMessage(ctx, client.tenant.id, {
      type: LogTypes.FAILED_EXCHANGE_AUTHORIZATION_CODE_FOR_ACCESS_TOKEN,
      description: "Invalid client credentials",
    });
    throw new JSONHTTPException(403, { message: "Invalid client credentials" });
  } else if (new Date(code.expires_at) < new Date()) {
    logMessage(ctx, client.tenant.id, {
      type: LogTypes.FAILED_EXCHANGE_AUTHORIZATION_CODE_FOR_ACCESS_TOKEN,
      description: "Code expired",
      userId: code.user_id,
    });
    throw new JSONHTTPException(403, { message: "Code expired" });
  } else if (code.used_at) {
    logMessage(ctx, client.tenant.id, {
      type: LogTypes.FAILED_EXCHANGE_AUTHORIZATION_CODE_FOR_ACCESS_TOKEN,
      description: "Invalid authorization code",
      userId: code.user_id,
    });
    throw new JSONHTTPException(400, {
      error: "invalid_grant",
      error_description: "Invalid authorization code",
    });
  }

  const loginSession = await ctx.env.data.loginSessions.get(
    client.tenant.id,
    code.login_id,
  );

  if (!loginSession) {
    throw new JSONHTTPException(403, { message: "Invalid login" });
  }

  // Validate organization parameter matches login session organization
  // Allow organization to be specified in token request even if login session has no org (Auth0 compatibility)
  if (params.organization && loginSession.authParams.organization) {
    if (params.organization !== loginSession.authParams.organization) {
      throw new JSONHTTPException(400, {
        error: "invalid_request",
        error_description:
          "Organization parameter does not match login session organization",
      });
    }
  }

  // Validate the secret or PKCE
  if ("client_secret" in params) {
    // A temporary solution to handle cross tenant clients
    let defaultClient;
    try {
      defaultClient = await getEnrichedClient(ctx.env, "DEFAULT_CLIENT");
    } catch {
      // DEFAULT_CLIENT may not exist
    }

    // Code flow
    if (
      !safeCompare(client.client_secret, params.client_secret) &&
      !safeCompare(defaultClient?.client_secret, params.client_secret)
    ) {
      logMessage(ctx, client.tenant.id, {
        type: LogTypes.FAILED_EXCHANGE_AUTHORIZATION_CODE_FOR_ACCESS_TOKEN,
        description: "Invalid client credentials",
        userId: code.user_id,
      });
      throw new JSONHTTPException(403, {
        message: "Invalid client credentials",
      });
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
      logMessage(ctx, client.tenant.id, {
        type: LogTypes.FAILED_EXCHANGE_AUTHORIZATION_CODE_FOR_ACCESS_TOKEN,
        description: "Invalid client credentials",
        userId: code.user_id,
      });
      throw new JSONHTTPException(403, {
        message: "Invalid client credentials",
      });
    }
  }

  // Validate the redirect_uri (RFC 6749 requires exact string comparison)
  if (code.redirect_uri && code.redirect_uri !== params.redirect_uri) {
    logMessage(ctx, client.tenant.id, {
      type: LogTypes.FAILED_EXCHANGE_AUTHORIZATION_CODE_FOR_ACCESS_TOKEN,
      description: "Invalid redirect uri",
      userId: code.user_id,
    });
    throw new JSONHTTPException(403, { message: "Invalid redirect uri" });
  }

  const user = await ctx.env.data.users.get(client.tenant.id, code.user_id);
  if (!user) {
    throw new JSONHTTPException(403, { message: "User not found" });
  }

  await ctx.env.data.codes.used(client.tenant.id, params.code);

  let refreshToken: RefreshToken | undefined;
  if (
    loginSession.session_id &&
    loginSession.authParams.scope?.split(" ").includes("offline_access")
  ) {
    // If the offline_access scope is requested, we need to create a refresh token
    refreshToken = await createRefreshToken(ctx, {
      user,
      client,
      session_id: loginSession.session_id,
      scope: loginSession.authParams.scope,
      audience: loginSession.authParams.audience,
    });
  }

  // Fetch organization data if organization ID is provided in the login session
  let organization: { id: string; name: string } | undefined;
  if (loginSession.authParams.organization) {
    const orgData = await ctx.env.data.organizations.get(
      client.tenant.id,
      loginSession.authParams.organization,
    );
    if (orgData) {
      organization = {
        id: orgData.id,
        name: orgData.name,
      };
    } else {
      // Organization doesn't exist, but we still pass the requested ID
      // so that membership validation can fail appropriately
      organization = {
        id: loginSession.authParams.organization,
        name: "Unknown", // This will fail membership check anyway
      };
    }
  }

  // OIDC Core 2.1: When max_age was used in authorization request, auth_time is required in ID token
  // Fetch the session to get the authenticated_at timestamp
  let auth_time: number | undefined;
  if (loginSession.authParams.max_age !== undefined && loginSession.session_id) {
    const session = await ctx.env.data.sessions.get(
      client.tenant.id,
      loginSession.session_id,
    );
    if (session?.authenticated_at) {
      auth_time = Math.floor(new Date(session.authenticated_at).getTime() / 1000);
    }
  }

  return {
    user,
    client,
    loginSession,
    session_id: loginSession.session_id,
    refresh_token: refreshToken?.id,
    organization,
    auth_time,
    authParams: {
      ...loginSession.authParams,
      // Use the state and nonce from the code as it might differ if it's a silent auth login
      state: code.state,
      nonce: code.nonce,
      // Ensure WEB_MESSAGE is explicitly passed, as createAuthResponse relies on it
      response_mode: AuthorizationResponseMode.WEB_MESSAGE,
      // Pass through other relevant authParams from the loginSession or original request if necessary
      // For authorization_code grant, these are usually fixed or derived, not directly from params
      client_id: client.client_id, // ensure client_id is from the validated client
      scope: loginSession.authParams.scope, // scope from original authorization request
      audience: loginSession.authParams.audience, // audience from original authorization request
    },
  };
}

// TODO: This should be removed and handeled in the authorize endpoint
export async function authorizationCodeGrant(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: AuthorizationCodeGrantTypeParams,
): Promise<TokenResponse | Response> {
  const result = await authorizationCodeGrantUser(ctx, params);

  // createAuthResponse will handle returning TokenResponse directly for WEB_MESSAGE
  // or a full Response for other cases (though not expected here due to fixed response_mode)
  return createFrontChannelAuthResponse(ctx, result);
}
