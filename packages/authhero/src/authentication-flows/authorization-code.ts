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

// OAuth 2.1 / RFC 7636: client_secret and code_verifier are independent and may co-exist.
// At least one MUST be supplied so an authorization code cannot be redeemed without proof
// (confidential client → client_secret; public client → code_verifier; both is also valid).
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
  .refine((data) => !!data.client_secret || !!data.code_verifier, {
    message: "client_secret or code_verifier is required",
  });

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
    // RFC 6749 §4.1.2: "If an authorization code is used more than once, the
    // authorization server MUST deny the request and SHOULD revoke (when
    // possible) all tokens previously issued based on that authorization
    // code." Revoke the original session + refresh tokens so the bearer
    // tokens issued from the first exchange stop working at userinfo etc.
    const revokedAt = new Date().toISOString();
    await ctx.env.data.refreshTokens
      .revokeByLoginSession(client.tenant.id, code.login_id, revokedAt)
      .catch((err) => {
        console.error(
          `Failed to revoke refresh tokens for login_id=${code.login_id}:`,
          err,
        );
      });
    const reusedLoginSession = await ctx.env.data.loginSessions
      .get(client.tenant.id, code.login_id)
      .catch(() => undefined);
    if (reusedLoginSession?.session_id) {
      await ctx.env.data.sessions
        .update(client.tenant.id, reusedLoginSession.session_id, {
          revoked_at: revokedAt,
        })
        .catch((err) => {
          console.error(
            `Failed to revoke session ${reusedLoginSession.session_id}:`,
            err,
          );
        });
    }

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

  // Reject exchanges with no verifiable proof of possession: a confidential client
  // must supply client_secret; a public client must supply code_verifier AND the
  // stored code must carry a code_challenge issued at /authorize. A bare
  // code_verifier against a non-PKCE code is not proof and must not authenticate.
  if (
    !params.client_secret &&
    !(params.code_verifier && code.code_challenge)
  ) {
    logMessage(ctx, client.tenant.id, {
      type: LogTypes.FAILED_EXCHANGE_AUTHORIZATION_CODE_FOR_ACCESS_TOKEN,
      description: "Missing client_secret and code_verifier",
      userId: code.user_id,
    });
    throw new JSONHTTPException(401, {
      message: "client_secret or code_verifier is required",
    });
  }

  // OAuth 2.1 / RFC 7636: validate client_secret and PKCE independently — both may be present.
  if (params.client_secret !== undefined) {
    // A temporary solution to handle cross tenant clients
    let defaultClient;
    try {
      defaultClient = await getEnrichedClient(ctx.env, "DEFAULT_CLIENT");
    } catch {
      // DEFAULT_CLIENT may not exist
    }

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
  }

  if (code.code_challenge) {
    // RFC 7636 §4.5: if code_challenge was sent at /authorize, code_verifier is required.
    if (!params.code_verifier) {
      logMessage(ctx, client.tenant.id, {
        type: LogTypes.FAILED_EXCHANGE_AUTHORIZATION_CODE_FOR_ACCESS_TOKEN,
        description: "Missing code_verifier",
        userId: code.user_id,
      });
      throw new JSONHTTPException(403, {
        message: "Invalid client credentials",
      });
    }
    const method = code.code_challenge_method || "plain";
    const challenge = await computeCodeChallenge(
      params.code_verifier,
      method,
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

  const codeUser = await ctx.env.data.users.get(client.tenant.id, code.user_id);
  if (!codeUser) {
    throw new JSONHTTPException(403, { message: "User not found" });
  }

  const user = codeUser.linked_to
    ? await ctx.env.data.users.get(client.tenant.id, codeUser.linked_to)
    : codeUser;
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
      login_id: loginSession.id,
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

  // OIDC Core §2: auth_time is REQUIRED when max_age is used and OPTIONAL
  // otherwise. We always compute it when a session is available so RPs can
  // detect re-authentication (e.g. prompt=login flows). The conformance
  // suite's oidcc-prompt-login test compares auth_time between two
  // authorizations and silently fails ("auth_time cannot be checked") when
  // either id_token omits it.
  let auth_time: number | undefined;
  if (loginSession.session_id) {
    const session = await ctx.env.data.sessions.get(
      client.tenant.id,
      loginSession.session_id,
    );
    if (session?.authenticated_at) {
      auth_time = Math.floor(
        new Date(session.authenticated_at).getTime() / 1000,
      );
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
