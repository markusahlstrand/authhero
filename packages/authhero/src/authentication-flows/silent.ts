import { Context } from "hono";
import {
  AuthorizationResponseType,
  AuthorizationResponseMode,
  CodeChallengeMethod,
  LogTypes,
  LoginSession,
  Session,
} from "@authhero/adapter-interfaces";
import { EnrichedClient } from "../helpers/client";
import { logMessage } from "../helpers/logging";
import { Bindings, Variables } from "../types";
import { serializeAuthCookie, clearAuthCookie } from "../utils/cookies";
import renderAuthIframe from "../utils/authIframe";
import { formPostResponse } from "../utils/form-post";
import { createAuthTokens, createCodeData } from "./common";
import { resolveConnectionName } from "../helpers/connection";

import { nanoid } from "nanoid";
import { calculateScopesAndPermissions } from "../helpers/scopes-permissions";

// OAuth 2.0 Multiple Response Type Encoding Practices §3: the default
// response_mode is `query` only for `response_type=code`; every other
// response_type (Implicit `token` / `id_token` / `id_token token`, Hybrid
// `code id_token` / `code token` / `code id_token token`) defaults to
// `fragment`. The OIDF check `RejectErrorInUrlQuery` enforces this for error
// responses too, so we use the same predicate for success and failure paths.
// An explicit response_mode (query/fragment) on the request always wins.
function shouldUseFragment(
  response_type: AuthorizationResponseType,
  response_mode?: AuthorizationResponseMode,
): boolean {
  if (response_mode === AuthorizationResponseMode.QUERY) return false;
  if (response_mode === AuthorizationResponseMode.FRAGMENT) return true;
  return response_type !== AuthorizationResponseType.CODE;
}

interface SilentAuthParams {
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>;
  client: EnrichedClient;
  session?: Session;
  redirect_uri: string;
  state: string;
  response_type: AuthorizationResponseType;
  response_mode?: AuthorizationResponseMode;
  nonce?: string;
  code_challenge_method?: CodeChallengeMethod;
  code_challenge?: string;
  audience?: string;
  scope?: string;
  organization?: string;
  max_age?: number;
}

export async function silentAuth({
  ctx,
  client,
  session,
  redirect_uri,
  state,
  nonce,
  code_challenge_method,
  code_challenge,
  audience,
  scope,
  response_type,
  response_mode,
  organization,
  max_age,
}: SilentAuthParams) {
  const { env } = ctx;
  const redirectURL = new URL(redirect_uri);
  const originUrl = `${redirectURL.protocol}//${redirectURL.host}`;

  // Determine if we should use iframe/postMessage or redirect
  // web_message response_mode means the request came from an iframe
  const useIframeResponse =
    response_mode === AuthorizationResponseMode.WEB_MESSAGE;

  // Helper function to handle login required scenarios
  async function handleLoginRequired(description: string = "Login required") {
    const headers = new Headers();

    // Only log and clear the session cookie if there was actually a session
    if (session) {
      logMessage(ctx, client.tenant.id, {
        type: LogTypes.FAILED_SILENT_AUTH,
        description,
      });

      const clearCookies = clearAuthCookie(client.tenant.id, ctx.var.host);
      clearCookies.forEach((cookie) => {
        headers.append("set-cookie", cookie);
      });
    }

    // For web_message response_mode (iframe), use postMessage
    if (useIframeResponse) {
      return renderAuthIframe(
        ctx,
        originUrl,
        JSON.stringify({
          error: "login_required",
          error_description: description,
          state,
        }),
        headers,
      );
    }

    // OIDC Core 3.1.2.6: error responses MUST use the same response_mode
    // the client requested for success. form_post → POST the params to the
    // redirect_uri; otherwise 302 with query (code) or fragment (token).
    const errorParams: Record<string, string> = {
      error: "login_required",
      error_description: description,
    };
    if (state) errorParams.state = state;

    if (response_mode === AuthorizationResponseMode.FORM_POST) {
      return formPostResponse(redirect_uri, errorParams, headers);
    }

    const errorUrl = new URL(redirect_uri);
    if (shouldUseFragment(response_type, response_mode)) {
      errorUrl.hash = new URLSearchParams(errorParams).toString();
    } else {
      for (const [k, v] of Object.entries(errorParams)) {
        errorUrl.searchParams.set(k, v);
      }
    }

    const responseHeaders: Record<string, string> = {
      Location: errorUrl.toString(),
    };
    const setCookieHeader = headers.get("set-cookie");
    if (setCookieHeader) {
      responseHeaders["set-cookie"] = setCookieHeader;
    }
    return new Response(null, {
      status: 302,
      headers: responseHeaders,
    });
  }

  // Check if session is valid
  const isSessionExpired =
    !session ||
    (session?.expires_at && new Date(session.expires_at) < new Date()) ||
    (session?.idle_expires_at &&
      new Date(session.idle_expires_at) < new Date());

  // OIDC Core 3.1.2.1: If max_age is present and session is older than max_age,
  // we must return login_required error for silent auth
  const isSessionTooOld =
    session &&
    max_age !== undefined &&
    Date.now() - new Date(session.authenticated_at).getTime() > max_age * 1000;

  if (isSessionExpired || isSessionTooOld) {
    return handleLoginRequired();
  }

  const sessionUser = await env.data.users.get(
    client.tenant.id,
    session.user_id,
  );

  if (!sessionUser) {
    console.error("User not found", session.user_id);
    return handleLoginRequired("User not found");
  }

  const user = sessionUser.linked_to
    ? await env.data.users.get(client.tenant.id, sessionUser.linked_to)
    : sessionUser;

  if (!user) {
    console.error("Linked primary user not found", sessionUser.linked_to);
    return handleLoginRequired("User not found");
  }

  ctx.set("user_id", user.user_id);

  ctx.set("username", user.email);
  ctx.set("connection", user.connection);

  // Fetch organization if specified
  let organizationEntity;
  if (organization) {
    organizationEntity = await env.data.organizations.get(
      client.tenant.id,
      organization,
    );

    if (!organizationEntity) {
      return handleLoginRequired("Organization not found");
    }
  }

  // Audience is pre-stamped on the /authorize request (tenant default_audience
  // applied there, not here), so this is already the effective value.
  const effectiveAudience = audience;
  let calculatedScopes = scope || "";
  let calculatedPermissions: string[] = [];
  let calculatedTokenLifetime: number | undefined;

  if (effectiveAudience) {
    try {
      const scopesAndPermissions = await calculateScopesAndPermissions(ctx, {
        tenantId: client.tenant.id,
        clientId: client.client_id,
        audience: effectiveAudience,
        requestedScopes: scope?.split(" ") || [],
        // Use resolved org ID to ensure membership check works with org names
        organizationId: organizationEntity?.id,
        userId: user.user_id,
      });
      calculatedScopes = scopesAndPermissions.scopes.join(" ");
      calculatedPermissions = scopesAndPermissions.permissions;

      // Use token_lifetime_for_web for SPA clients, token_lifetime for all others
      calculatedTokenLifetime =
        client.app_type === "spa" && scopesAndPermissions.token_lifetime_for_web
          ? scopesAndPermissions.token_lifetime_for_web
          : scopesAndPermissions.token_lifetime;
    } catch (error: any) {
      // Check for 403 errors from org membership validation or scope validation
      if (error?.statusCode === 403 || error?.status === 403) {
        const errorDescription =
          error?.body?.error_description || error?.message || "Access denied";
        return handleLoginRequired(errorDescription);
      }
      throw error;
    }
  } else if (organizationEntity) {
    // No audience but organization specified - still need to validate membership
    const userOrgs = await env.data.userOrganizations.list(client.tenant.id, {
      q: `user_id:${user.user_id}`,
      per_page: 1000,
    });

    const isMember = userOrgs.userOrganizations.some(
      (uo) => uo.organization_id === organizationEntity.id,
    );

    if (!isMember) {
      return handleLoginRequired(
        "User is not a member of the specified organization",
      );
    }
  }

  // Propagate the auth_connection so downstream hooks (e.g.
  // onExecuteCredentialsExchange triggered by the SPA's subsequent /oauth/token
  // call) receive the connection the user originally authenticated with.
  // Prefer the original login session's auth_connection (the exact value used
  // at authentication time); fall back to the resolved primary user's
  // connection, which silent auth always operates on.
  let originalLoginSession: LoginSession | null | undefined;
  if (session.login_session_id) {
    originalLoginSession = await env.data.loginSessions.get(
      client.tenant.id,
      session.login_session_id,
    );
  }
  // Silent auth always operates on the resolved primary user, so user.connection
  // is an acceptable fallback when the original session didn't record one.
  const auth_connection = resolveConnectionName({
    loginSession: originalLoginSession,
    user,
  });

  // Create a new login session for this silent auth flow
  const loginSession = await env.data.loginSessions.create(client.tenant.id, {
    csrf_token: nanoid(),
    authParams: {
      client_id: client.client_id,
      audience,
      scope,
      state,
      nonce,
      response_type,
      redirect_uri,
      organization,
      max_age,
    },
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes
    session_id: session.id,
    ...(auth_connection ? { auth_connection } : {}),
    ip: ctx.var.ip,
    useragent: ctx.var.useragent,
  });

  // OIDC Core 2.1: auth_time is required when max_age was used in authorization request
  const auth_time =
    max_age !== undefined
      ? Math.floor(new Date(session.authenticated_at).getTime() / 1000)
      : undefined;

  const tokenResponseOptions = {
    client,
    authParams: {
      client_id: client.client_id,
      audience,
      code_challenge_method,
      code_challenge,
      scope: calculatedScopes,
      state,
      nonce,
      response_type,
      redirect_uri,
      max_age,
    },
    user,
    session_id: session.id,
    auth_time,
    permissions: calculatedPermissions,
    organization: organizationEntity,
    token_lifetime: calculatedTokenLifetime,
  };

  // Create authentication tokens, code, or both (hybrid).
  const responseTypeTokens = response_type.split(" ");
  const wantsCode = responseTypeTokens.includes("code");
  const wantsIdToken = responseTypeTokens.includes("id_token");
  const wantsAccessToken = responseTypeTokens.includes("token");
  const isHybrid = wantsCode && (wantsIdToken || wantsAccessToken);

  let tokenResponse: Record<string, unknown>;
  if (response_type === AuthorizationResponseType.CODE) {
    tokenResponse = await createCodeData(ctx, {
      user,
      client,
      authParams: tokenResponseOptions.authParams,
      login_id: loginSession.id,
    });
  } else if (isHybrid) {
    // Hybrid: issue the code first so c_hash can be computed inside
    // createAuthTokens (mirrors completeLogin in common.ts).
    const codeData = await createCodeData(ctx, {
      user,
      client,
      authParams: tokenResponseOptions.authParams,
      login_id: loginSession.id,
    });
    const tokens = await createAuthTokens(ctx, {
      ...tokenResponseOptions,
      code: codeData.code,
    });
    tokenResponse = {
      ...tokens,
      code: codeData.code,
      state: codeData.state,
    };
  } else {
    tokenResponse = await createAuthTokens(ctx, tokenResponseOptions);
  }

  // Update session idle timeout using tenant settings
  const newIdleExpiresAt = client.tenant.idle_session_lifetime
    ? new Date(
        Date.now() + client.tenant.idle_session_lifetime * 60 * 60 * 1000,
      ).toISOString()
    : undefined;

  await env.data.sessions.update(client.tenant.id, session.id, {
    used_at: new Date().toISOString(),
    last_interaction_at: new Date().toISOString(),
    login_session_id: loginSession.id,
    device: {
      ...session.device,
      last_ip: ctx.var.ip || "",
      last_user_agent: ctx.var.useragent || "",
    },
    idle_expires_at: newIdleExpiresAt,
  });

  // Keep the login_session alive as long as the session is active
  if (newIdleExpiresAt) {
    await env.data.loginSessions.update(client.tenant.id, loginSession.id, {
      expires_at: newIdleExpiresAt,
    });
  }

  // Log successful authentication
  logMessage(ctx, client.tenant.id, {
    type: LogTypes.SUCCESS_SILENT_AUTH,
    description: "Successful silent authentication",
  });

  // Set response headers
  const headers = new Headers();
  const cookies = serializeAuthCookie(
    client.tenant.id,
    session.id,
    ctx.var.host,
  );
  cookies.forEach((cookie) => {
    headers.append("set-cookie", cookie);
  });

  // For web_message response_mode (iframe), use postMessage
  if (useIframeResponse) {
    return renderAuthIframe(
      ctx,
      originUrl,
      JSON.stringify({
        ...tokenResponse,
        state,
      }),
      headers,
    );
  }

  // Emit only the fields the requested response_type actually carries — mirrors
  // createFrontChannelAuthResponse so that, for example, hybrid `code id_token`
  // doesn't leak the internally-issued access_token into the redirect.
  const successParams: Record<string, string> = {};
  const code = tokenResponse.code;
  const access_token = tokenResponse.access_token;
  const id_token = tokenResponse.id_token;
  if (wantsCode && typeof code === "string") {
    successParams.code = code;
  }
  if (typeof access_token === "string") {
    if (wantsAccessToken) {
      successParams.access_token = access_token;
      if (typeof tokenResponse.token_type === "string") {
        successParams.token_type = tokenResponse.token_type;
      }
      if (typeof tokenResponse.expires_in === "number") {
        successParams.expires_in = String(tokenResponse.expires_in);
      }
    }
    if (wantsIdToken && typeof id_token === "string") {
      successParams.id_token = id_token;
    }
  }
  if (state) successParams.state = state;
  if ((wantsAccessToken || wantsIdToken) && scope) successParams.scope = scope;

  if (response_mode === AuthorizationResponseMode.FORM_POST) {
    return formPostResponse(redirect_uri, successParams, headers);
  }

  const successUrl = new URL(redirect_uri);
  if (shouldUseFragment(response_type, response_mode)) {
    successUrl.hash = new URLSearchParams(successParams).toString();
  } else {
    for (const [k, v] of Object.entries(successParams)) {
      successUrl.searchParams.set(k, v);
    }
  }

  const responseHeaders: Record<string, string> = {
    Location: successUrl.toString(),
  };
  const redirectCookie = headers.get("set-cookie");
  if (redirectCookie) {
    responseHeaders["set-cookie"] = redirectCookie;
  }
  return new Response(null, {
    status: 302,
    headers: responseHeaders,
  });
}
