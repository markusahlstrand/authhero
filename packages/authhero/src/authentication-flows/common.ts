import {
  AuthorizationResponseMode,
  AuthorizationResponseType,
  AuthParams,
  LoginSession,
  LoginSessionState,
  User,
  TokenResponse,
} from "@authhero/adapter-interfaces";
import { EnrichedClient } from "../helpers/client";
import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { TimeSpan } from "oslo";
import { createJWT } from "oslo/jwt";
import { nanoid } from "nanoid";
import { ulid } from "ulid";
import { generateCodeVerifier } from "oslo/oauth2";
import { pemToBuffer } from "../utils/crypto";
import { Bindings, Variables } from "../types";
import {
  AUTHORIZATION_CODE_EXPIRES_IN_SECONDS,
  SILENT_AUTH_MAX_AGE_IN_SECONDS,
  TICKET_EXPIRATION_TIME,
} from "../constants";
import { serializeAuthCookie } from "../utils/cookies";
import { samlCallback } from "../strategies/saml";
import { postUserLoginHook } from "../hooks/index";
import renderAuthIframe from "../utils/authIframe";
import { calculateScopesAndPermissions } from "../helpers/scopes-permissions";
import { JSONHTTPException } from "../errors/json-http-exception";
import { GrantType } from "@authhero/adapter-interfaces";
import {
  transitionLoginSession,
  LoginSessionEventType,
} from "../state-machines/login-session";
import { createServiceToken } from "../helpers/service-token";
import { redactUrlForLogging } from "../utils/url";

export interface CreateAuthTokensParams {
  authParams: AuthParams;
  client: EnrichedClient;
  loginSession?: LoginSession;
  user?: User;
  session_id?: string;
  refresh_token?: string;
  authStrategy?: { strategy: string; strategy_type: string };
  ticketAuth?: boolean;
  skipHooks?: boolean;
  organization?: { id: string; name: string };
  permissions?: string[];
  grantType?: GrantType;
  impersonatingUser?: User; // The original user who is impersonating
  // OIDC Core 2.1: auth_time is required when max_age is used in authorization request
  auth_time?: number; // Unix timestamp of when the user was authenticated
}

const RESERVED_CLAIMS = ["sub", "iss", "aud", "exp", "nbf", "iat", "jti"];

export async function createAuthTokens(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: CreateAuthTokensParams,
): Promise<TokenResponse> {
  const {
    authParams,
    user,
    client,
    session_id,
    organization,
    permissions,
    impersonatingUser,
    auth_time,
  } = params;

  const { signingKeys } = await ctx.env.data.keys.list({
    q: "type:jwt_signing",
  });
  const validKeys = signingKeys.filter(
    (key: any) => !key.revoked_at || new Date(key.revoked_at) > new Date(),
  );
  const signingKey = validKeys[validKeys.length - 1];

  if (!signingKey?.pkcs7) {
    throw new JSONHTTPException(500, { message: "No signing key available" });
  }

  const keyBuffer = pemToBuffer(signingKey.pkcs7);
  const iss = ctx.var.custom_domain
    ? `https://${ctx.var.custom_domain}/`
    : ctx.env.ISSUER;

  // Determine audience with fallback to tenant default
  const audience = authParams.audience || client.tenant.audience;

  if (!audience) {
    throw new JSONHTTPException(400, {
      error: "invalid_request",
      error_description:
        "An audience must be specified in the request or configured as the tenant default_audience",
    });
  }

  const accessTokenPayload: Record<string, unknown> = {
    aud: audience,
    scope: authParams.scope || "",
    sub: user?.user_id || authParams.client_id,
    iss,
    tenant_id: ctx.var.tenant_id,
    sid: session_id,
    act: impersonatingUser ? { sub: impersonatingUser.user_id } : undefined, // RFC 8693 act claim for impersonation
    org_id: organization ? organization.id : undefined,
    // Include org_name in access token if tenant has allow_organization_name_in_authentication_api enabled
    // Auth0 SDK validates org_name case-insensitively by lowercasing the expected value,
    // so we lowercase the org_name to match the validation behavior
    org_name:
      organization &&
      client.tenant.allow_organization_name_in_authentication_api
        ? organization.name.toLowerCase()
        : undefined,
    permissions,
  };

  // Parse scopes to determine which claims to include in id_token
  // Following OIDC Core spec section 5.4 for standard claims
  const scopes = authParams.scope?.split(" ") || [];
  const hasOpenidScope = scopes.includes("openid");
  const hasProfileScope = scopes.includes("profile");
  const hasEmailScope = scopes.includes("email");

  // Per OIDC Core section 5.4: Claims requested by profile, email, address, and phone
  // scopes are returned from the UserInfo Endpoint, EXCEPT for response_type=id_token
  // where there is no access token issued to access the userinfo endpoint.
  //
  // However, Auth0's behavior differs: it always includes profile/email claims in the
  // ID token when those scopes are requested, regardless of response_type.
  //
  // We use the client's auth0_conformant flag to determine which behavior to use:
  // - auth0_conformant=true (default): Auth0-compatible behavior (always include claims in ID token)
  // - auth0_conformant=false: Strict OIDC 5.4 compliance (claims only in ID token for response_type=id_token)
  const isIdTokenOnlyFlow =
    authParams.response_type === AuthorizationResponseType.ID_TOKEN;
  const shouldIncludeProfileClaimsInIdToken =
    client.auth0_conformant !== false || isIdTokenOnlyFlow;

  const idTokenPayload =
    user && hasOpenidScope
      ? {
          // The audience for an id token is the client id
          aud: authParams.client_id,
          sub: user.user_id,
          iss,
          sid: session_id,
          nonce: authParams.nonce,
          // OIDC Core 2.1: auth_time is REQUIRED when max_age was used in authorization request
          // It's the time when the End-User authentication occurred (Unix timestamp)
          ...(authParams.max_age !== undefined && auth_time !== undefined
            ? { auth_time }
            : {}),
          // OIDC Core 2.1: When acr_values is requested, the server SHOULD return
          // an acr claim with one of the requested values
          ...(authParams.acr_values
            ? { acr: authParams.acr_values.split(" ")[0] }
            : {}),
          // Profile scope claims - include based on auth0_conformant setting
          // For auth0_conformant clients (default): always include when profile scope is requested
          // For strict OIDC clients: only include for response_type=id_token (per OIDC 5.4)
          ...(hasProfileScope &&
            shouldIncludeProfileClaimsInIdToken && {
              given_name: user.given_name,
              family_name: user.family_name,
              nickname: user.nickname,
              picture: user.picture,
              locale: user.locale,
              name: user.name,
            }),
          // Email scope claims - include based on auth0_conformant setting
          // For auth0_conformant clients (default): always include when email scope is requested
          // For strict OIDC clients: only include for response_type=id_token (per OIDC 5.4)
          ...(hasEmailScope &&
            shouldIncludeProfileClaimsInIdToken && {
              email: user.email,
              email_verified: user.email_verified,
            }),
          act: impersonatingUser
            ? { sub: impersonatingUser.user_id }
            : undefined,
          org_id: organization?.id,
          // Auth0 SDK validates org_name case-insensitively, so we lowercase it
          org_name: organization?.name.toLowerCase(),
        }
      : undefined;

  if (ctx.env.hooks?.onExecuteCredentialsExchange) {
    await ctx.env.hooks.onExecuteCredentialsExchange(
      {
        ctx,
        client,
        user,
        request: {
          ip: ctx.var.ip || "",
          user_agent: ctx.var.useragent || "",
          method: ctx.req.method,
          url: ctx.req.url,
        },
        scope: authParams.scope || "",
        grant_type: "",
      },
      {
        accessToken: {
          setCustomClaim: (claim, value) => {
            if (RESERVED_CLAIMS.includes(claim)) {
              throw new Error(`Cannot overwrite reserved claim '${claim}'`);
            }
            accessTokenPayload[claim] = value;
          },
        },
        idToken: {
          setCustomClaim: (claim, value) => {
            if (RESERVED_CLAIMS.includes(claim)) {
              throw new Error(`Cannot overwrite reserved claim '${claim}'`);
            }

            if (idTokenPayload) {
              idTokenPayload[claim] = value;
            }
          },
        },
        access: {
          deny: (code) => {
            throw new JSONHTTPException(400, {
              message: `Access denied: ${code}`,
            });
          },
        },
        token: {
          createServiceToken: async (params: {
            scope: string;
            expiresInSeconds?: number;
          }) => {
            const tokenResponse = await createServiceToken(
              ctx,
              ctx.var.tenant_id,
              params.scope,
              params.expiresInSeconds,
            );
            return tokenResponse.access_token;
          },
        },
      },
    );
  }

  const header = {
    includeIssuedTimestamp: true,
    expiresIn: impersonatingUser ? new TimeSpan(1, "h") : new TimeSpan(1, "d"),
    headers: {
      kid: signingKey.kid,
    },
  };

  const access_token = await createJWT(
    "RS256",
    keyBuffer,
    accessTokenPayload,
    header,
  );

  const id_token = idTokenPayload
    ? await createJWT("RS256", keyBuffer, idTokenPayload, header)
    : undefined;

  return {
    access_token,
    refresh_token: params.refresh_token,
    id_token,
    token_type: "Bearer",
    expires_in: impersonatingUser ? 3600 : 86400, // 1 hour for impersonation, 24 hours for regular sessions
  };
}

export interface CreateCodeParams {
  user: User;
  client: EnrichedClient;
  authParams: AuthParams;
  login_id: string;
}

export async function createCodeData(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: CreateCodeParams,
) {
  const code = await ctx.env.data.codes.create(params.client.tenant.id, {
    code_id: nanoid(32), // 32 chars = 192 bits of entropy (RFC6749-10.10 requires high entropy)
    user_id: params.user.user_id,
    code_type: "authorization_code",
    login_id: params.login_id,
    expires_at: new Date(
      Date.now() + AUTHORIZATION_CODE_EXPIRES_IN_SECONDS * 1000,
    ).toISOString(),
    code_challenge: params.authParams.code_challenge,
    code_challenge_method: params.authParams.code_challenge_method,
    redirect_uri: params.authParams.redirect_uri,
    state: params.authParams.state,
    nonce: params.authParams.nonce,
  });

  return {
    code: code.code_id,
    state: params.authParams.state,
  };
}

export interface CreateRefreshTokenParams {
  user: User;
  client: EnrichedClient;
  session_id: string;
  scope: string;
  audience?: string;
}

export async function createRefreshToken(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: CreateRefreshTokenParams,
) {
  const {
    client,
    scope,
    // fallback to the default audience on the client
    audience = client.tenant.audience,
    session_id,
  } = params;

  const refreshToken = await ctx.env.data.refreshTokens.create(
    client.tenant.id,
    {
      id: ulid(),
      session_id,
      client_id: client.client_id,
      idle_expires_at: new Date(
        Date.now() + SILENT_AUTH_MAX_AGE_IN_SECONDS * 1000,
      ).toISOString(),
      user_id: params.user.user_id,
      device: {
        last_ip: ctx.var.ip,
        initial_ip: ctx.var.ip,
        last_user_agent: ctx.var.useragent || "",
        initial_user_agent: ctx.var.useragent || "",
        // TODO: add Authentication Strength Name
        initial_asn: "",
        last_asn: "",
      },
      resource_servers: [
        {
          audience,
          scopes: scope,
        },
      ],
      rotating: false,
    },
  );

  return refreshToken;
}

export interface CreateSessionParams {
  user: User;
  client: EnrichedClient;
  loginSession: LoginSession;
}

/**
 * Create a new session for a user (internal helper)
 * This is called by authenticateLoginSession when no existing session is available
 */
async function createNewSession(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  { user, client, loginSession }: CreateSessionParams,
) {
  // Create a new session
  const session = await ctx.env.data.sessions.create(client.tenant.id, {
    id: ulid(),
    user_id: user.user_id,
    login_session_id: loginSession.id,
    idle_expires_at: new Date(
      Date.now() + SILENT_AUTH_MAX_AGE_IN_SECONDS * 1000,
    ).toISOString(),
    device: {
      last_ip: ctx.var.ip || "",
      initial_ip: ctx.var.ip || "",
      last_user_agent: ctx.var.useragent || "",
      initial_user_agent: ctx.var.useragent || "",
      // TODO: add Autonomous System Number
      initial_asn: "",
      last_asn: "",
    },
    clients: [client.client_id],
  });

  return session;
}

export interface AuthenticateLoginSessionParams {
  user: User;
  client: EnrichedClient;
  loginSession: LoginSession;
  /** Optional existing session to reuse instead of creating a new one */
  existingSessionId?: string;
}

/**
 * Authenticate a login session - transitions from PENDING to AUTHENTICATED
 *
 * This is the single source of truth for authentication state transitions.
 * It either creates a new session or links an existing one, and always
 * transitions the state to AUTHENTICATED.
 *
 * Uses optimistic concurrency: re-fetches current state to prevent stale overwrites
 * and guards against terminal states (FAILED, EXPIRED, COMPLETED)
 *
 * @returns The session ID (either newly created or existing)
 */
export async function authenticateLoginSession(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  {
    user,
    client,
    loginSession,
    existingSessionId,
  }: AuthenticateLoginSessionParams,
): Promise<string> {
  // Re-fetch current state to prevent stale overwrites
  const currentLoginSession = await ctx.env.data.loginSessions.get(
    client.tenant.id,
    loginSession.id,
  );
  if (!currentLoginSession) {
    throw new HTTPException(400, {
      message: `Login session ${loginSession.id} not found`,
    });
  }

  const currentState = currentLoginSession.state || LoginSessionState.PENDING;

  // Guard against terminal states
  if (
    currentState === LoginSessionState.FAILED ||
    currentState === LoginSessionState.EXPIRED ||
    currentState === LoginSessionState.COMPLETED
  ) {
    throw new HTTPException(400, {
      message: `Cannot authenticate login session in ${currentState} state`,
    });
  }

  // If already authenticated, return the existing session_id
  if (currentState === LoginSessionState.AUTHENTICATED) {
    if (currentLoginSession.session_id) {
      return currentLoginSession.session_id;
    }
    // State is authenticated but no session_id - this shouldn't happen, but handle it
    throw new HTTPException(500, {
      message: `Login session is authenticated but has no session_id`,
    });
  }

  // Determine the session ID - either use existing or create new
  let session_id: string;
  if (existingSessionId) {
    // Verify the existing session exists and is not revoked
    const existingSession = await ctx.env.data.sessions.get(
      client.tenant.id,
      existingSessionId,
    );

    if (!existingSession || existingSession.revoked_at) {
      // Session doesn't exist or was revoked - create a new one instead
      const newSession = await createNewSession(ctx, {
        user,
        client,
        loginSession,
      });
      session_id = newSession.id;
    } else {
      // Reuse existing valid session
      session_id = existingSessionId;

      // Ensure the client is associated with the existing session
      if (!existingSession.clients.includes(client.client_id)) {
        await ctx.env.data.sessions.update(client.tenant.id, existingSessionId, {
          clients: [...existingSession.clients, client.client_id],
        });
      }
    }
  } else {
    // Create a new session
    const newSession = await createNewSession(ctx, {
      user,
      client,
      loginSession,
    });
    session_id = newSession.id;
  }

  // Transition to AUTHENTICATED state
  const { state: newState } = transitionLoginSession(currentState, {
    type: LoginSessionEventType.AUTHENTICATE,
    userId: user.user_id,
  });

  // Update the login session with session_id, user_id, and new state
  await ctx.env.data.loginSessions.update(client.tenant.id, loginSession.id, {
    session_id,
    state: newState,
    user_id: user.user_id,
  });

  return session_id;
}

/**
 * @deprecated Use authenticateLoginSession instead.
 * This function is kept for backward compatibility but will be removed.
 */
export async function createSession(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  { user, client, loginSession }: CreateSessionParams,
) {
  const session_id = await authenticateLoginSession(ctx, {
    user,
    client,
    loginSession,
  });

  // Return a session-like object for backward compatibility
  return { id: session_id };
}

/**
 * Mark a login session as failed
 * This should be called when authentication fails (wrong password, blocked user, etc.)
 *
 * Uses optimistic concurrency: re-fetches current state to prevent stale overwrites
 */
export async function failLoginSession(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenantId: string,
  loginSession: LoginSession,
  reason: string,
): Promise<void> {
  // Re-fetch current state to prevent stale overwrites
  const currentSession = await ctx.env.data.loginSessions.get(
    tenantId,
    loginSession.id,
  );
  if (!currentSession) {
    console.warn(
      `Login session ${loginSession.id} not found when trying to mark as failed`,
    );
    return;
  }

  const currentState = currentSession.state || LoginSessionState.PENDING;
  const { state: newState, context } = transitionLoginSession(currentState, {
    type: LoginSessionEventType.FAIL,
    reason,
  });

  // Only update if transition is valid and state changed
  if (newState !== currentState) {
    await ctx.env.data.loginSessions.update(tenantId, loginSession.id, {
      state: newState,
      failure_reason: context.failureReason,
    });
  }
}

/**
 * Mark a login session as awaiting hook completion
 * This should be called when redirecting to a form, page, or external URL
 *
 * Uses optimistic concurrency: re-fetches current state to prevent stale overwrites
 */
export async function startLoginSessionHook(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenantId: string,
  loginSession: LoginSession,
  hookId?: string,
): Promise<void> {
  // Re-fetch current state to prevent stale overwrites
  const currentSession = await ctx.env.data.loginSessions.get(
    tenantId,
    loginSession.id,
  );
  if (!currentSession) {
    console.warn(
      `Login session ${loginSession.id} not found when trying to start hook`,
    );
    return;
  }

  const currentState = currentSession.state || LoginSessionState.PENDING;
  const { state: newState, context } = transitionLoginSession(currentState, {
    type: LoginSessionEventType.START_HOOK,
    hookId,
  });

  // Only update if transition is valid and state changed
  if (newState !== currentState) {
    await ctx.env.data.loginSessions.update(tenantId, loginSession.id, {
      state: newState,
      state_data: context.hookId
        ? JSON.stringify({ hookId: context.hookId })
        : undefined,
    });
  }
}

/**
 * Mark a login session as returning from a hook
 * This should be called when the user returns via /u/continue after a form/page redirect
 *
 * Uses optimistic concurrency: re-fetches current state to prevent stale overwrites
 */
export async function completeLoginSessionHook(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenantId: string,
  loginSession: LoginSession,
): Promise<void> {
  // Re-fetch current state to prevent stale overwrites
  const currentSession = await ctx.env.data.loginSessions.get(
    tenantId,
    loginSession.id,
  );
  if (!currentSession) {
    console.warn(
      `Login session ${loginSession.id} not found when trying to complete hook`,
    );
    return;
  }

  const currentState = currentSession.state || LoginSessionState.PENDING;
  const { state: newState } = transitionLoginSession(currentState, {
    type: LoginSessionEventType.COMPLETE_HOOK,
  });

  // Only update if transition is valid and state changed
  if (newState !== currentState) {
    await ctx.env.data.loginSessions.update(tenantId, loginSession.id, {
      state: newState,
      state_data: undefined, // Clear hook data
    });
  }
}

/**
 * Mark a login session as completed (tokens issued)
 * This should be called when tokens are successfully returned to the client
 *
 * Uses optimistic concurrency: re-fetches current state to prevent stale overwrites
 */
export async function completeLoginSession(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenantId: string,
  loginSession: LoginSession,
): Promise<void> {
  // Re-fetch current state to prevent stale overwrites
  const currentSession = await ctx.env.data.loginSessions.get(
    tenantId,
    loginSession.id,
  );
  if (!currentSession) {
    console.warn(
      `Login session ${loginSession.id} not found when trying to mark as completed`,
    );
    return;
  }

  const currentState = currentSession.state || LoginSessionState.PENDING;
  const { state: newState } = transitionLoginSession(currentState, {
    type: LoginSessionEventType.COMPLETE,
  });

  // Only update if transition is valid and state changed
  if (newState !== currentState) {
    await ctx.env.data.loginSessions.update(tenantId, loginSession.id, {
      state: newState,
    });
  }
}

/**
 * Start a continuation - user is redirected to an account page (change-email, etc.)
 * This transitions to AWAITING_CONTINUATION and stores the allowed scope and return URL
 *
 * Uses optimistic concurrency: re-fetches current state to prevent stale overwrites
 */
export async function startLoginSessionContinuation(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenantId: string,
  loginSession: LoginSession,
  scope: string[],
  returnUrl: string,
): Promise<void> {
  // Re-fetch current state to prevent stale overwrites
  const currentSession = await ctx.env.data.loginSessions.get(
    tenantId,
    loginSession.id,
  );
  if (!currentSession) {
    console.warn(
      `Login session ${loginSession.id} not found when trying to start continuation`,
    );
    return;
  }

  const currentState = currentSession.state || LoginSessionState.PENDING;
  const { state: newState } = transitionLoginSession(currentState, {
    type: LoginSessionEventType.START_CONTINUATION,
    scope,
  });

  // Only update if transition is valid and state changed
  if (newState !== currentState) {
    await ctx.env.data.loginSessions.update(tenantId, loginSession.id, {
      state: newState,
      state_data: JSON.stringify({
        continuationScope: scope,
        continuationReturnUrl: returnUrl,
      }),
    });
  } else {
    // Log when state transition is invalid (state didn't change)
    console.warn(
      `Failed to start continuation for login session ${loginSession.id}: ` +
        `cannot transition from ${currentState} to AWAITING_CONTINUATION. ` +
        `Scope: ${JSON.stringify(scope)}, Return URL: ${redactUrlForLogging(returnUrl)}`,
    );
  }
}

/**
 * Complete a continuation - user finished the account page action
 * This transitions back to AUTHENTICATED so the login flow can continue
 *
 * Uses optimistic concurrency: re-fetches current state to prevent stale overwrites
 */
export async function completeLoginSessionContinuation(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenantId: string,
  loginSession: LoginSession,
): Promise<string | undefined> {
  // Re-fetch current state to prevent stale overwrites
  const currentSession = await ctx.env.data.loginSessions.get(
    tenantId,
    loginSession.id,
  );
  if (!currentSession) {
    console.warn(
      `Login session ${loginSession.id} not found when trying to complete continuation`,
    );
    return undefined;
  }

  // Parse state_data to get return URL
  let returnUrl: string | undefined;
  if (currentSession.state_data) {
    try {
      const data = JSON.parse(currentSession.state_data);
      returnUrl = data.continuationReturnUrl;
    } catch {
      // Ignore parse errors
    }
  }

  const currentState = currentSession.state || LoginSessionState.PENDING;
  const { state: newState } = transitionLoginSession(currentState, {
    type: LoginSessionEventType.COMPLETE_CONTINUATION,
  });

  // Only update if transition is valid and state changed
  if (newState !== currentState) {
    await ctx.env.data.loginSessions.update(tenantId, loginSession.id, {
      state: newState,
      state_data: undefined, // Clear continuation data
    });
  } else {
    console.warn(
      `completeLoginSessionContinuation: State transition from ${currentState} with COMPLETE_CONTINUATION was invalid or no-op`,
    );
  }

  return returnUrl;
}

/**
 * Parse state_data JSON to get continuation scope
 */
function getContinuationScope(loginSession: LoginSession): string[] | null {
  if (!loginSession.state_data) return null;
  try {
    const data = JSON.parse(loginSession.state_data);
    return data.continuationScope || null;
  } catch {
    return null;
  }
}

/**
 * Check if a login session allows access to a given scope during continuation
 */
export function hasValidContinuationScope(
  loginSession: LoginSession,
  requiredScope: string,
): boolean {
  if (loginSession.state !== LoginSessionState.AWAITING_CONTINUATION) {
    return false;
  }

  const scopes = getContinuationScope(loginSession);
  if (!scopes) return false;

  return scopes.includes(requiredScope);
}

export interface CreateAuthResponseParams {
  authParams: AuthParams;
  client: EnrichedClient;
  user: User;
  loginSession?: LoginSession;
  /**
   * An existing session ID to link to the login session instead of creating a new one.
   * Use this when the user already has a valid session (e.g., from a cookie) that should be reused.
   *
   * If not provided and loginSession is in PENDING state, a new session will be created.
   * If provided, this session will be linked and the state will transition to AUTHENTICATED.
   */
  existingSessionIdToLink?: string;
  refreshToken?: string;
  ticketAuth?: boolean;
  authStrategy?: { strategy: string; strategy_type: string };
  skipHooks?: boolean;
  organization?: { id: string; name: string };
  impersonatingUser?: User; // The original user who is impersonating
}

export async function createFrontChannelAuthResponse(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: CreateAuthResponseParams,
): Promise<Response> {
  const { authParams, client, ticketAuth } = params;
  let { user } = params;

  const responseType =
    authParams.response_type || AuthorizationResponseType.CODE;
  const responseMode =
    authParams.response_mode || AuthorizationResponseMode.QUERY;

  if (ticketAuth) {
    if (!params.loginSession) {
      throw new JSONHTTPException(500, {
        message: "Login session not found for ticket auth.",
      });
    }

    // Call post-login hooks before returning the ticket
    // This ensures logging and metadata updates happen immediately
    if (user && !params.skipHooks) {
      // Update the user's app_metadata with the strategy used for login
      if (
        params.authStrategy &&
        user.app_metadata?.strategy !== params.authStrategy.strategy
      ) {
        user.app_metadata = {
          ...user.app_metadata,
          strategy: params.authStrategy.strategy,
        };
        await ctx.env.data.users.update(client.tenant.id, user.user_id, {
          app_metadata: {
            ...(user.app_metadata || {}),
            strategy: params.authStrategy.strategy,
          },
        });
      }

      await postUserLoginHook(
        ctx,
        ctx.env.data,
        client.tenant.id,
        user,
        params.loginSession,
        {
          client,
          authParams,
          authStrategy: params.authStrategy,
        },
      );
    }

    const co_verifier = generateCodeVerifier();
    const co_id = nanoid(12);

    const code = await ctx.env.data.codes.create(client.tenant.id, {
      code_id: nanoid(32), // Use high entropy for security
      code_type: "ticket",
      login_id: params.loginSession.id,
      expires_at: new Date(Date.now() + TICKET_EXPIRATION_TIME).toISOString(),
      code_verifier: [co_id, co_verifier].join("|"),
      redirect_uri: authParams.redirect_uri,
      state: authParams.state,
      nonce: authParams.nonce,
    });

    return ctx.json({
      login_ticket: code.code_id,
      co_verifier,
      co_id,
    });
  }

  // ============================================================================
  // STATE-BASED SESSION HANDLING
  // ============================================================================
  // The login session state is the single source of truth:
  // - PENDING: User hasn't authenticated yet, need to create/link session
  // - AUTHENTICATED: User is authenticated, session exists, ready for tokens
  // - COMPLETED: Tokens have been issued (terminal state)
  // - FAILED/EXPIRED: Terminal error states
  //
  // We always ensure the session is in AUTHENTICATED state before proceeding
  // to issue tokens, which will transition it to COMPLETED.
  // ============================================================================

  let refresh_token = params.refreshToken;
  let session_id: string | undefined;

  // If we have a login session, use state-based logic to determine what to do
  if (params.loginSession) {
    // Re-fetch the login session to get the current state
    const currentLoginSession = await ctx.env.data.loginSessions.get(
      client.tenant.id,
      params.loginSession.id,
    );

    if (!currentLoginSession) {
      throw new JSONHTTPException(500, {
        message: "Login session not found.",
      });
    }

    const currentState = currentLoginSession.state || LoginSessionState.PENDING;

    // Guard against terminal states
    if (currentState === LoginSessionState.COMPLETED) {
      throw new JSONHTTPException(400, {
        error: "invalid_request",
        error_description: "Login session has already been completed",
      });
    }
    if (currentState === LoginSessionState.FAILED) {
      throw new JSONHTTPException(400, {
        error: "access_denied",
        error_description: `Login session failed: ${currentLoginSession.failure_reason || "unknown reason"}`,
      });
    }
    if (currentState === LoginSessionState.EXPIRED) {
      throw new JSONHTTPException(400, {
        error: "invalid_request",
        error_description: "Login session has expired",
      });
    }

    // If state is PENDING (or any pre-authenticated state), we need to authenticate
    if (currentState === LoginSessionState.PENDING) {
      session_id = await authenticateLoginSession(ctx, {
        user,
        client,
        loginSession: params.loginSession,
        existingSessionId: params.existingSessionIdToLink,
      });
    } else {
      // State is AUTHENTICATED (or AWAITING_* states that allow completion)
      // Use the session_id from the login session
      session_id = currentLoginSession.session_id;

      if (!session_id) {
        throw new JSONHTTPException(500, {
          message: `Login session in ${currentState} state but has no session_id`,
        });
      }
    }
  } else {
    // No login session provided - this is an error for front-channel responses
    throw new JSONHTTPException(500, {
      message:
        "loginSession must be provided for front-channel auth responses.",
    });
  }

  // If a refresh token wasn't passed in (or already set) and 'offline_access' is in the current authParams.scope, create one.
  // Don't create refresh tokens for impersonated users for security reasons.
  if (
    !refresh_token &&
    authParams.scope?.split(" ").includes("offline_access") &&
    ![AuthorizationResponseType.TOKEN, AuthorizationResponseType.CODE].includes(
      responseType,
    ) &&
    !params.impersonatingUser
  ) {
    const newRefreshToken = await createRefreshToken(ctx, {
      user,
      client,
      session_id,
      scope: authParams.scope,
      audience: authParams.audience,
    });
    refresh_token = newRefreshToken.id;
  }

  if (responseMode === AuthorizationResponseMode.SAML_POST) {
    if (!session_id) {
      throw new HTTPException(500, {
        message: "Session ID not available for SAML response",
      });
    }
    return samlCallback(
      ctx,
      params.client,
      params.authParams,
      user,
      session_id,
    );
  }

  const tokens = await completeLogin(ctx, {
    authParams,
    user,
    client,
    session_id,
    refresh_token,
    authStrategy: params.authStrategy,
    loginSession: params.loginSession,
    responseType,
    skipHooks: params.skipHooks,
    organization: params.organization,
    impersonatingUser: params.impersonatingUser,
  });

  // If completeLogin returned a Response (from a hook redirect), return it directly
  if (tokens instanceof Response) {
    return tokens;
  }

  if (responseMode === AuthorizationResponseMode.WEB_MESSAGE) {
    if (!authParams.redirect_uri) {
      throw new JSONHTTPException(400, {
        message: "Redirect URI not allowed for WEB_MESSAGE response mode.",
      });
    }

    const headers = new Headers();
    if (session_id) {
      const authCookies = serializeAuthCookie(
        client.tenant.id,
        session_id,
        ctx.var.host || "",
      );
      authCookies.forEach((cookie) => {
        headers.append("set-cookie", cookie);
      });
    } else {
      console.warn(
        "Session ID not available for WEB_MESSAGE, cookie will not be set.",
      );
    }

    const redirectURL = new URL(authParams.redirect_uri);
    const originUrl = `${redirectURL.protocol}//${redirectURL.host}`;

    return renderAuthIframe(
      ctx,
      originUrl,
      JSON.stringify({ ...tokens, state: authParams.state }),
      headers,
    );
  }

  if (!authParams.redirect_uri) {
    throw new JSONHTTPException(400, {
      message: "Redirect uri not found for this response mode.",
    });
  }

  const headers = new Headers();
  if (session_id) {
    const authCookies = serializeAuthCookie(
      client.tenant.id,
      session_id,
      ctx.var.custom_domain || ctx.req.header("host") || "",
    );
    authCookies.forEach((cookie) => {
      headers.append("set-cookie", cookie);
    });
  }

  // Fallback for other redirect-based responses
  const redirectUri = new URL(authParams.redirect_uri);

  if ("code" in tokens) {
    redirectUri.searchParams.set("code", tokens.code);
    if (tokens.state) {
      redirectUri.searchParams.set("state", tokens.state);
    }
  } else if ("access_token" in tokens) {
    redirectUri.hash = new URLSearchParams({
      access_token: tokens.access_token,
      ...(tokens.id_token && { id_token: tokens.id_token }),
      token_type: tokens.token_type,
      expires_in: tokens.expires_in.toString(),
      ...(authParams.state && { state: authParams.state }),
      ...(authParams.scope && { scope: authParams.scope }),
    }).toString();
  } else {
    throw new JSONHTTPException(500, {
      message: "Invalid token response for implicit flow.",
    });
  }

  headers.set("location", redirectUri.toString());
  return new Response("Redirecting", {
    status: 302,
    headers,
  });
}

// Wrapper to trigger OnExecutePostLogin before issuing tokens or codes
export async function completeLogin(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: CreateAuthTokensParams & { responseType?: AuthorizationResponseType },
): Promise<TokenResponse | { code: string; state?: string } | Response> {
  let { user } = params;
  const responseType = params.responseType || AuthorizationResponseType.TOKEN;

  // CRITICAL: Enforce organization membership validation even without audience
  // This prevents users from forging org_id claims in tokens
  if (user && params.organization) {
    const userOrgs = await ctx.env.data.userOrganizations.list(
      params.client.tenant.id,
      {
        q: `user_id:${user.user_id}`,
        per_page: 1000, // Should be enough for most cases
      },
    );

    const isMember = userOrgs.userOrganizations.some(
      (uo) => uo.organization_id === params.organization!.id,
    );

    if (!isMember) {
      // User is not a member of the organization - throw 403 error
      throw new JSONHTTPException(403, {
        error: "access_denied",
        error_description: "User is not a member of the specified organization",
      });
    }
  }

  // Calculate scopes and permissions early, before any hooks
  // This will throw a 403 error if user is not a member of the required organization
  let calculatedScopes = params.authParams.scope || "";
  let calculatedPermissions: string[] = [];

  if (params.authParams.audience) {
    try {
      let scopesAndPermissions;

      if (
        params.grantType === GrantType.ClientCredential ||
        (!user && !params.user)
      ) {
        // Client credentials grant - no user context
        scopesAndPermissions = await calculateScopesAndPermissions(ctx, {
          grantType: GrantType.ClientCredential,
          tenantId: params.client.tenant.id,
          clientId: params.client.client_id,
          audience: params.authParams.audience,
          requestedScopes: params.authParams.scope?.split(" ") || [],
          organizationId: params.organization?.id,
        });
      } else {
        // User-based grant - user ID is required
        const userId = user?.user_id || params.user?.user_id;
        if (!userId) {
          throw new JSONHTTPException(400, {
            error: "invalid_request",
            error_description: "User ID is required for user-based grants",
          });
        }

        scopesAndPermissions = await calculateScopesAndPermissions(ctx, {
          grantType: params.grantType as
            | GrantType.AuthorizationCode
            | GrantType.RefreshToken
            | GrantType.Password
            | GrantType.Passwordless
            | GrantType.OTP
            | undefined,
          tenantId: params.client.tenant.id,
          userId: userId,
          clientId: params.client.client_id,
          audience: params.authParams.audience,
          requestedScopes: params.authParams.scope?.split(" ") || [],
          organizationId: params.organization?.id,
        });
      }

      calculatedScopes = scopesAndPermissions.scopes.join(" ");
      calculatedPermissions = scopesAndPermissions.permissions;
    } catch (error) {
      // Re-throw HTTPExceptions (like 403 for organization membership)
      if (error instanceof HTTPException) {
        throw error;
      }
    }
  }

  // Update authParams with calculated scopes for downstream usage
  const updatedAuthParams = {
    ...params.authParams,
    scope: calculatedScopes,
  };

  // Run hooks if we have a loginSession (authentication flow) and skipHooks is not set
  if (params.loginSession && user && !params.skipHooks) {
    // Update the user's app_metadata with the strategy used for login
    if (
      params.authStrategy &&
      user.app_metadata?.strategy !== params.authStrategy.strategy
    ) {
      user.app_metadata = {
        ...user.app_metadata,
        strategy: params.authStrategy.strategy,
      };
      await ctx.env.data.users.update(params.client.tenant.id, user.user_id, {
        app_metadata: {
          ...(user.app_metadata || {}),
          strategy: params.authStrategy.strategy,
        },
      });
    }

    const hookResult = await postUserLoginHook(
      ctx,
      ctx.env.data,
      params.client.tenant.id,
      user,
      params.loginSession,
      {
        client: params.client,
        authParams: updatedAuthParams,
        authStrategy: params.authStrategy,
      },
    );

    // If the hook returns a Response (redirect), return it directly
    if (hookResult instanceof Response) {
      return hookResult;
    }

    // Use the updated user
    user = hookResult;
  }

  // Return either code data or tokens based on response type
  // Note: completeLoginSession is called AFTER successful creation to avoid
  // marking session as COMPLETED if token/code creation fails
  if (responseType === AuthorizationResponseType.CODE) {
    if (!user || !params.loginSession) {
      throw new JSONHTTPException(500, {
        message: "User and loginSession is required for code flow",
      });
    }
    const codeData = await createCodeData(ctx, {
      user,
      client: params.client,
      authParams: updatedAuthParams,
      login_id: params.loginSession.id,
    });

    // Mark login session as completed after successful code creation
    await completeLoginSession(
      ctx,
      params.client.tenant.id,
      params.loginSession,
    );

    return codeData;
  } else {
    const tokens = await createAuthTokens(ctx, {
      ...params,
      user,
      authParams: updatedAuthParams,
      permissions: calculatedPermissions,
    });

    // Mark login session as completed after successful token creation
    if (params.loginSession) {
      await completeLoginSession(
        ctx,
        params.client.tenant.id,
        params.loginSession,
      );
    }

    return tokens;
  }
}
