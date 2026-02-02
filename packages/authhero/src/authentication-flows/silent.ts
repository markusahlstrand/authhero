import { Context } from "hono";
import {
  AuthorizationResponseType,
  AuthorizationResponseMode,
  CodeChallengeMethod,
  LogTypes,
  Session,
} from "@authhero/adapter-interfaces";
import { EnrichedClient } from "../helpers/client";
import { logMessage } from "../helpers/logging";
import { Bindings, Variables } from "../types";
import { serializeAuthCookie, clearAuthCookie } from "../utils/cookies";
import renderAuthIframe from "../utils/authIframe";
import { createAuthTokens, createCodeData } from "./common";
import { SILENT_AUTH_MAX_AGE_IN_SECONDS } from "../constants";
import { nanoid } from "nanoid";
import { calculateScopesAndPermissions } from "../helpers/scopes-permissions";

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

      const clearCookies = clearAuthCookie(
        client.tenant.id,
        ctx.req.header("host"),
      );
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

    // For other response modes, redirect back with error
    // Use fragment for token responses, query for code responses
    const errorUrl = new URL(redirect_uri);
    const useFragment =
      response_type === AuthorizationResponseType.TOKEN ||
      response_type === AuthorizationResponseType.TOKEN_ID_TOKEN;

    if (useFragment) {
      const params = new URLSearchParams();
      params.set("error", "login_required");
      params.set("error_description", description);
      if (state) params.set("state", state);
      errorUrl.hash = params.toString();
    } else {
      errorUrl.searchParams.set("error", "login_required");
      errorUrl.searchParams.set("error_description", description);
      if (state) errorUrl.searchParams.set("state", state);
    }

    // Apply headers to the redirect response
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

  ctx.set("user_id", session.user_id);

  const user = await env.data.users.get(client.tenant.id, session.user_id);

  if (!user) {
    console.error("User not found", session.user_id);
    return handleLoginRequired("User not found");
  }

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

  // Calculate scopes and permissions - also validates org membership
  const effectiveAudience = audience || client.tenant.audience;
  let calculatedScopes = scope || "";
  let calculatedPermissions: string[] = [];

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
  };

  // Create authentication tokens or code
  const tokenResponse =
    response_type === AuthorizationResponseType.CODE
      ? await createCodeData(ctx, {
          user,
          client,
          authParams: tokenResponseOptions.authParams,
          login_id: loginSession.id,
        })
      : await createAuthTokens(ctx, tokenResponseOptions);

  // Update session
  await env.data.sessions.update(client.tenant.id, session.id, {
    used_at: new Date().toISOString(),
    last_interaction_at: new Date().toISOString(),
    login_session_id: loginSession.id,
    device: {
      ...session.device,
      last_ip: ctx.var.ip || "",
      last_user_agent: ctx.var.useragent || "",
    },
    idle_expires_at: session.idle_expires_at
      ? new Date(
          Date.now() + SILENT_AUTH_MAX_AGE_IN_SECONDS * 1000,
        ).toISOString()
      : undefined,
  });

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
    ctx.req.header("host"),
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

  // For other response modes, redirect back with the token/code
  const successUrl = new URL(redirect_uri);
  const useFragment =
    response_type === AuthorizationResponseType.TOKEN ||
    response_type === AuthorizationResponseType.TOKEN_ID_TOKEN;

  if (useFragment) {
    const params = new URLSearchParams();
    Object.entries(tokenResponse).forEach(([key, value]) => {
      if (value !== undefined) params.set(key, String(value));
    });
    if (state) params.set("state", state);
    successUrl.hash = params.toString();
  } else {
    Object.entries(tokenResponse).forEach(([key, value]) => {
      if (value !== undefined) successUrl.searchParams.set(key, String(value));
    });
    if (state) successUrl.searchParams.set("state", state);
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
