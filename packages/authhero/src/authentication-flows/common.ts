import {
  AuthorizationResponseMode,
  AuthorizationResponseType,
  AuthParams,
  LoginSession,
  LoginSessionState,
  RefreshToken,
  User,
  TokenResponse,
} from "@authhero/adapter-interfaces";
import {
  formatRefreshToken,
  generateRefreshTokenParts,
  hashRefreshTokenSecret,
} from "../utils/refresh-token-format";
import { EnrichedClient } from "../helpers/client";
import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { TimeSpan } from "oslo";
import { createJWT } from "oslo/jwt";
import { nanoid } from "nanoid";
import { ulid } from "../utils/ulid";
import { generateCodeVerifier } from "oslo/oauth2";
import { pemToBuffer } from "../utils/crypto";
import { algForCert } from "../utils/jwk-alg";
import { computeIdTokenHash } from "../utils/id-token-hash";
import { Bindings, Variables } from "../types";
import {
  AUTHORIZATION_CODE_EXPIRES_IN_SECONDS,
  TICKET_EXPIRATION_TIME,
  UNIVERSAL_AUTH_SESSION_EXPIRES_IN_SECONDS,
} from "../constants";
import { serializeAuthCookie } from "../utils/cookies";
import { getIssuer } from "../variables";
import { samlCallback } from "../strategies/saml";
import { postUserLoginHook } from "../hooks/index";
import {
  isTemplateHook,
  handleCredentialsExchangeTemplateHook,
} from "../hooks/templatehooks";
import { handleCredentialsExchangeCodeHooks } from "../hooks/codehooks";
import renderAuthIframe from "../utils/authIframe";
import { formPostResponse } from "../utils/form-post";
import { calculateScopesAndPermissions } from "../helpers/scopes-permissions";
import {
  buildScopeClaims,
  buildRequestedClaims,
} from "../helpers/scope-claims";
import { resolveSigningKeys } from "../helpers/signing-keys";
import { JSONHTTPException } from "../errors/json-http-exception";
import { GrantType } from "@authhero/adapter-interfaces";
import {
  transitionLoginSession,
  LoginSessionEventType,
} from "../state-machines/login-session";
import { createServiceToken } from "../helpers/service-token";
import { redactUrlForLogging } from "../utils/url";
import { OnExecuteCredentialsExchangeAPI } from "../types/Hooks";
import {
  resolveConnectionName,
  getConnectionInfo,
} from "../helpers/connection";

/**
 * Minimal client properties actually used by createAuthTokens.
 * This avoids requiring a full EnrichedClient when only a few fields are needed
 * (e.g. service tokens).
 */
export interface AuthTokenClient {
  client_id: string;
  tenant: {
    audience: string;
    default_audience?: string;
    allow_organization_name_in_authentication_api?: boolean;
  };
  auth0_conformant?: boolean;
}

export interface CreateAuthTokensParams {
  authParams: AuthParams;
  client: AuthTokenClient;
  loginSession?: LoginSession;
  user?: User;
  session_id?: string;
  refresh_token?: string;
  authStrategy?: { strategy: string; strategy_type: string };
  /** The connection name used for authentication (e.g., "email", "google-oauth2") */
  authConnection?: string;
  ticketAuth?: boolean;
  skipHooks?: boolean;
  organization?: { id: string; name: string };
  permissions?: string[];
  grantType?: GrantType;
  impersonatingUser?: User; // The original user who is impersonating
  // OIDC Core 2.1: auth_time is required when max_age is used in authorization request
  auth_time?: number; // Unix timestamp of when the user was authenticated
  /** Custom claims to add to the access token payload (cannot override reserved claims) */
  customClaims?: Record<string, unknown>;
  /** Access token lifetime in seconds, from resource server config */
  token_lifetime?: number;
  /**
   * Authorization code co-issued in the same front-channel response (hybrid
   * flow). When provided AND an id_token is being issued, a `c_hash` claim
   * covering this code is added to the id_token per OIDC Core 3.3.2.11.
   */
  code?: string;
}

const RESERVED_CLAIMS = ["sub", "iss", "aud", "exp", "nbf", "iat", "jti"];

function buildCredentialsExchangeApi(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  accessTokenPayload: Record<string, unknown>,
  idTokenPayload: Record<string, unknown> | undefined,
): OnExecuteCredentialsExchangeAPI {
  return {
    accessToken: {
      setCustomClaim: (claim: string, value: any) => {
        if (RESERVED_CLAIMS.includes(claim)) {
          throw new Error(`Cannot overwrite reserved claim '${claim}'`);
        }
        accessTokenPayload[claim] = value;
      },
    },
    idToken: {
      setCustomClaim: (claim: string, value: any) => {
        if (RESERVED_CLAIMS.includes(claim)) {
          throw new Error(`Cannot overwrite reserved claim '${claim}'`);
        }
        if (idTokenPayload) {
          idTokenPayload[claim] = value;
        }
      },
    },
    access: {
      deny: (code: string) => {
        throw new JSONHTTPException(400, {
          message: `Access denied: ${code}`,
        });
      },
    },
    token: {
      createServiceToken: async (params: {
        scope: string;
        expiresInSeconds?: number;
        customClaims?: Record<string, unknown>;
      }) => {
        const tokenResponse = await createServiceToken(
          ctx,
          ctx.var.tenant_id,
          params.scope,
          params.expiresInSeconds,
          params.customClaims,
        );
        return tokenResponse.access_token;
      },
    },
  };
}

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
    grantType,
  } = params;

  // OIDC Core §2: auth_time is REQUIRED in the ID Token whenever max_age was
  // used in the authorization request, and OPTIONAL otherwise. Code-flow and
  // silent-auth callers compute it themselves and pass it in; the universal-
  // login implicit/hybrid path goes straight from credential submission into
  // createAuthTokens without that step. To keep the ID Token compliant for
  // every flow, fall back to looking up the session's `authenticated_at`
  // here when no auth_time was supplied. Otherwise the OIDF check
  // `CheckIdTokenAuthTimeClaimPresentDueToMaxAge` fails for implicit
  // `max_age` modules.
  let auth_time = params.auth_time;
  if (auth_time === undefined && session_id && ctx.var.tenant_id) {
    const session = await ctx.env.data.sessions.get(
      ctx.var.tenant_id,
      session_id,
    );
    if (session?.authenticated_at) {
      auth_time = Math.floor(
        new Date(session.authenticated_at).getTime() / 1000,
      );
    }
  }

  // Without a tenant_id on the request, there is no per-tenant decision to
  // make — fall back to the control-plane bucket regardless of the
  // configured mode.
  const tenantIdForKeys = ctx.var.tenant_id;
  const resolvedKeys = await resolveSigningKeys(
    ctx.env.data.keys,
    tenantIdForKeys ?? "",
    tenantIdForKeys ? ctx.env.signingKeyMode : "control-plane",
    { purpose: "sign" },
  );
  const signingKey = resolvedKeys[0];

  if (!signingKey?.pkcs7 || !signingKey.cert) {
    throw new JSONHTTPException(500, { message: "No signing key available" });
  }

  const keyBuffer = pemToBuffer(signingKey.pkcs7);
  const signingAlg = await algForCert(signingKey.cert);
  const iss = getIssuer(ctx.env, ctx.var.custom_domain);

  // Audience is normally stamped onto authParams at /authorize (or
  // /oauth/token for client_credentials). Fall back to the tenant's
  // default_audience for callers that create login sessions without going
  // through /authorize, then to `${iss}userinfo` so audience-less requests
  // still produce a JWT — Auth0 parity for "I just want login + /userinfo".
  const audience =
    authParams.audience ?? client.tenant.default_audience ?? `${iss}userinfo`;

  // OIDC Core 5.5 — when the original /authorize request carried a `claims`
  // parameter with a `userinfo` member, the requested claim names need to
  // survive to /userinfo time. /userinfo only sees the access token, so we
  // stash the list as a custom claim. Key list (no essential/value markers)
  // is sufficient because we use the "include-if-available" emission policy.
  const requestedUserinfoClaims = authParams.claims?.userinfo
    ? Object.keys(authParams.claims.userinfo)
    : undefined;

  const accessTokenPayload: Record<string, unknown> = {
    aud: audience,
    scope: authParams.scope || "",
    sub: user?.user_id || authParams.client_id,
    iss,
    tenant_id: ctx.var.tenant_id,
    sid: session_id,
    act: impersonatingUser ? { sub: impersonatingUser.user_id } : undefined, // RFC 8693 act claim for impersonation
    org_id: organization ? organization.id : undefined,
    // Surface requested userinfo claims so /userinfo can additively emit
    // them. Omitted when no `claims` param was sent (keeps tokens small for
    // the common case).
    requested_userinfo_claims: requestedUserinfoClaims,
    // Include org_name in access token if tenant has allow_organization_name_in_authentication_api enabled
    // Auth0 SDK validates org_name case-insensitively by lowercasing the expected value,
    // so we lowercase the org_name to match the validation behavior
    org_name:
      organization &&
      client.tenant.allow_organization_name_in_authentication_api
        ? organization.name.toLowerCase()
        : undefined,
    permissions,
    // Spread custom claims last so they can add new fields but not override reserved ones above
    ...params.customClaims,
  };

  // Validate that custom claims don't override reserved JWT claims
  if (params.customClaims) {
    for (const claim of RESERVED_CLAIMS) {
      if (claim in params.customClaims) {
        throw new Error(`Cannot overwrite reserved claim '${claim}'`);
      }
    }
  }

  // Parse scopes to determine which claims to include in id_token
  // Following OIDC Core spec section 5.4 for standard claims
  const scopes = authParams.scope?.split(" ") || [];
  const hasOpenidScope = scopes.includes("openid");

  // Per OIDC Core 5.4: scope-driven Claims (profile / email / address / phone)
  // are returned from the UserInfo Endpoint "when a response_type value is
  // used that results in an Access Token being issued." Only the pure
  // `id_token` response_type never produces an access_token (no /authorize
  // access_token, no token-endpoint exchange), so it's the only case where
  // those Claims MUST live in the ID Token. Every other response_type
  // — implicit `id_token token`, basic `code`, all three hybrid variants —
  // eventually yields an access_token (at /authorize or via the code
  // exchange), so the OIDF suite's `EnsureIdTokenDoesNotContainEmailForScopeEmail`
  // (and profile/address/phone siblings) WARN if those Claims appear in the
  // ID Token.
  //
  // Auth0's default behavior diverges: it always includes scope-driven Claims
  // in the ID Token regardless of response_type. The `auth0_conformant` flag
  // picks between modes:
  // - auth0_conformant=true (default): Auth0-compatible (always include)
  // - auth0_conformant=false: Strict OIDC 5.4 (include only when response_type
  //   is exactly `id_token`)
  const isPureIdTokenResponseType =
    (authParams.response_type ?? "").trim() ===
    AuthorizationResponseType.ID_TOKEN;
  const shouldIncludeScopeClaimsInIdToken =
    client.auth0_conformant !== false || isPureIdTokenResponseType;

  const idTokenPayload: Record<string, unknown> | undefined =
    user && hasOpenidScope
      ? {
          // The audience for an id token is the client id
          aud: authParams.client_id,
          sub: user.user_id,
          iss,
          sid: session_id,
          nonce: authParams.nonce,
          // OIDC Core §2: auth_time is REQUIRED when max_age was used and
          // OPTIONAL otherwise. Always emit when we have it — adding the
          // claim is non-breaking (existing RPs ignore unknown claims), and
          // it lets RPs verify re-authentication for prompt=login / max_age
          // flows.
          ...(auth_time !== undefined ? { auth_time } : {}),
          // OIDC Core 2.1: When acr_values is requested, the server SHOULD return
          // an acr claim with one of the requested values
          ...(authParams.acr_values
            ? { acr: authParams.acr_values.split(" ")[0] }
            : {}),
          // OIDC Core 5.4 scope-driven claims (profile, email, address, phone),
          // shared with /userinfo via buildScopeClaims so the two stay in sync.
          ...(shouldIncludeScopeClaimsInIdToken
            ? buildScopeClaims(user, scopes)
            : {}),
          // OIDC Core 5.5 — additively include any individual claims the RP
          // requested via `claims.id_token`, regardless of scope. Listed
          // after scope-claims so requested values can override (in practice
          // they're identical lookups, but the order matches the spec's
          // "Requested Claims" precedence guidance).
          ...(authParams.claims?.id_token
            ? buildRequestedClaims(
                user,
                Object.keys(authParams.claims.id_token),
              )
            : {}),
          // OIDC Core 5.5 / 5.3.2 — when no Access Token is issued (pure
          // `id_token` response_type), there is no /userinfo to query, so
          // claims requested under `claims.userinfo` must fall through into
          // the ID Token. The conformance suite's `EnsureIdTokenContainsName`
          // module asserts exactly this for the implicit `id_token` and
          // form-post-implicit `id_token` variants.
          ...(isPureIdTokenResponseType && authParams.claims?.userinfo
            ? buildRequestedClaims(
                user,
                Object.keys(authParams.claims.userinfo),
              )
            : {}),
          act: impersonatingUser
            ? { sub: impersonatingUser.user_id }
            : undefined,
          org_id: organization?.id,
          // Auth0 SDK validates org_name case-insensitively, so we lowercase it
          org_name: organization?.name.toLowerCase(),
        }
      : undefined;

  // Resolve the connection for hooks. Session sources win (correct even for
  // linked users); `user` is passed as the last-resort fallback so
  // event.connection is still populated on token-exchange / refresh requests
  // that carry no session connection — matching Auth0's contract.
  const connectionName = resolveConnectionName({
    loginSession: params.loginSession,
    authConnection: params.authConnection,
    ctxConnection: ctx.var.connection,
    user,
  });
  const connectionInfo = await getConnectionInfo(
    ctx,
    ctx.var.tenant_id,
    connectionName,
    user,
  );

  if (ctx.env.hooks?.onExecuteCredentialsExchange) {
    await ctx.env.hooks.onExecuteCredentialsExchange(
      {
        ctx,
        client: client as EnrichedClient,
        user,
        request: {
          ip: ctx.var.ip || "",
          user_agent: ctx.var.useragent || "",
          method: ctx.req.method,
          url: ctx.req.url,
        },
        scope: authParams.scope || "",
        grant_type: grantType ?? "",
        organization,
        connection:
          connectionInfo ||
          (connectionName
            ? {
                id: connectionName,
                name: connectionName,
                strategy: user?.provider || "auth0",
              }
            : undefined),
      },
      buildCredentialsExchangeApi(ctx, accessTokenPayload, idTokenPayload),
    );
  }

  // Execute credentials-exchange template hooks from the database
  {
    const { hooks } = await ctx.env.data.hooks.list(ctx.var.tenant_id, {
      q: "trigger_id:credentials-exchange",
      page: 0,
      per_page: 100,
      include_totals: false,
    });

    const credentialsExchangeTemplateHooks = hooks.filter(
      (h: any) => h.enabled && isTemplateHook(h),
    );

    const templateApi = buildCredentialsExchangeApi(
      ctx,
      accessTokenPayload,
      idTokenPayload,
    );

    if (user) {
      for (const hook of credentialsExchangeTemplateHooks) {
        if (!isTemplateHook(hook)) continue;
        try {
          await handleCredentialsExchangeTemplateHook(
            ctx,
            hook.template_id,
            user,
            templateApi,
          );
        } catch (err) {
          // Let HTTPExceptions (e.g. access.deny()) propagate
          if (err instanceof HTTPException) {
            throw err;
          }
          console.warn(
            `[credentials-exchange] Failed to execute template hook: ${hook.template_id}`,
            err,
          );
        }
      }
    }

    // Execute credentials-exchange code hooks
    const codeHookApi = buildCredentialsExchangeApi(
      ctx,
      accessTokenPayload,
      idTokenPayload,
    );

    const executionId = await handleCredentialsExchangeCodeHooks(
      ctx,
      hooks,
      {
        ctx,
        client: client as EnrichedClient,
        user,
        request: {
          ip: ctx.var.ip || "",
          user_agent: ctx.var.useragent || "",
          method: ctx.req?.method || "",
          url: ctx.req?.url || "",
        },
        scope: authParams.scope || "",
        grant_type: grantType ?? "",
        organization,
        connection:
          connectionInfo ||
          (connectionName
            ? {
                id: connectionName,
                name: connectionName,
                strategy: user?.provider || "auth0",
              }
            : undefined),
      },
      codeHookApi,
    );
    if (executionId) {
      ctx.set("action_execution_id", executionId);
    }
  }

  // Default: 86400s (24h), overridden by resource server config, 3600s (1h) for impersonation
  const effectiveTokenLifetime = impersonatingUser
    ? 3600
    : (params.token_lifetime ?? 86400);

  const header = {
    includeIssuedTimestamp: true,
    expiresIn: new TimeSpan(effectiveTokenLifetime, "s"),
    headers: {
      kid: signingKey.kid,
    },
  };

  const access_token = await createJWT(
    signingAlg,
    keyBuffer,
    accessTokenPayload,
    header,
  );

  // OIDC Core 3.3.2.11 — when an id_token is co-issued with a code at the
  // authorization endpoint (hybrid `code id_token` / `code id_token token`),
  // include c_hash covering the code. When co-issued with an access_token at
  // the authorization endpoint (implicit `id_token token` / hybrid `code
  // id_token token`), include at_hash covering the access_token.
  if (idTokenPayload) {
    const responseTypeTokens = (authParams.response_type ?? "").split(" ");
    if (params.code && responseTypeTokens.includes("code")) {
      idTokenPayload.c_hash = await computeIdTokenHash(params.code, signingAlg);
    }
    if (
      responseTypeTokens.includes("id_token") &&
      responseTypeTokens.includes("token")
    ) {
      idTokenPayload.at_hash = await computeIdTokenHash(
        access_token,
        signingAlg,
      );
    }
  }

  const id_token = idTokenPayload
    ? await createJWT(signingAlg, keyBuffer, idTokenPayload, header)
    : undefined;

  return {
    access_token,
    refresh_token: params.refresh_token,
    id_token,
    token_type: "Bearer",
    expires_in: effectiveTokenLifetime,
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
  login_id: string;
  scope: string;
  audience?: string;
}

export interface CreatedRefreshToken {
  row: RefreshToken;
  wireToken: string;
}

function lifetimeToIso(lifetimeHours?: number): string | undefined {
  if (!lifetimeHours) return undefined;
  return new Date(Date.now() + lifetimeHours * 60 * 60 * 1000).toISOString();
}

export async function createRefreshToken(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: CreateRefreshTokenParams,
): Promise<CreatedRefreshToken> {
  const { client, scope, login_id } = params;
  // Mirror createAuthTokens: fall back to default_audience, then to the
  // userinfo aud so audience-less flows can still mint a refresh token.
  const iss = getIssuer(ctx.env, ctx.var.custom_domain);
  const audience =
    params.audience ?? client.tenant.default_audience ?? `${iss}userinfo`;

  const idleExpiresAt = lifetimeToIso(client.tenant.idle_session_lifetime);
  const absoluteExpiresAt = lifetimeToIso(client.tenant.session_lifetime);

  const id = ulid();
  const { lookup, secret } = generateRefreshTokenParts();
  const token_hash = await hashRefreshTokenSecret(secret);
  const rotating = client.refresh_token?.rotation_type === "rotating";

  const row = await ctx.env.data.refreshTokens.create(client.tenant.id, {
    id,
    login_id,
    client_id: client.client_id,
    idle_expires_at: idleExpiresAt,
    expires_at: absoluteExpiresAt,
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
    rotating,
    token_lookup: lookup,
    token_hash,
    family_id: id,
  });

  return { row, wireToken: formatRefreshToken(lookup, secret) };
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
  // Create a new session with tenant-configured lifetimes
  const idleExpiresAt = lifetimeToIso(client.tenant.idle_session_lifetime);
  const absoluteExpiresAt = lifetimeToIso(client.tenant.session_lifetime);

  const session = await ctx.env.data.sessions.create(client.tenant.id, {
    id: ulid(),
    user_id: user.user_id,
    login_session_id: loginSession.id,
    idle_expires_at: idleExpiresAt,
    expires_at: absoluteExpiresAt,
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
  /** The connection name used for authentication (e.g., "email", "google-oauth2") */
  authConnection?: string;
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
    authConnection,
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

  // Guard against terminal states (EXPIRED is allowed — see createFrontChannelAuthResponse)
  if (currentState === LoginSessionState.FAILED) {
    throw new JSONHTTPException(400, {
      error: "access_denied",
      error_description:
        currentLoginSession.failure_reason ||
        "Cannot authenticate login session in failed state",
    });
  }
  if (currentState === LoginSessionState.COMPLETED) {
    throw new JSONHTTPException(400, {
      error: "access_denied",
      error_description: "Login session has already been completed",
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
        await ctx.env.data.sessions.update(
          client.tenant.id,
          existingSessionId,
          {
            clients: [...existingSession.clients, client.client_id],
          },
        );
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
  // If the session was EXPIRED, treat as PENDING for the state machine transition
  // since the XState machine defines expired as a final state with no outbound transitions
  const stateForTransition =
    currentState === LoginSessionState.EXPIRED
      ? LoginSessionState.PENDING
      : currentState;
  const { state: newState } = transitionLoginSession(stateForTransition, {
    type: LoginSessionEventType.AUTHENTICATE,
    userId: user.user_id,
  });

  // Resolve the connection used for authentication. No user fallback here: this
  // value is persisted as the session's authoritative auth_connection, so we
  // only ever store a real auth signal — never a guess from the user record.
  const resolvedConnection = resolveConnectionName({
    authConnection,
    ctxConnection: ctx.var.connection,
  });

  // Update the login session with session_id, user_id, new state, and auth_connection
  // auth_connection is stored early so it survives hook redirects (new HTTP requests)
  // If recovering from EXPIRED, also extend expires_at so the session doesn't
  // immediately expire again during subsequent MFA/hook checks
  await ctx.env.data.loginSessions.update(client.tenant.id, loginSession.id, {
    session_id,
    state: newState,
    user_id: user.user_id,
    ...(resolvedConnection ? { auth_connection: resolvedConnection } : {}),
    ...(currentState === LoginSessionState.EXPIRED
      ? {
          expires_at: new Date(
            Date.now() + UNIVERSAL_AUTH_SESSION_EXPIRES_IN_SECONDS * 1000,
          ).toISOString(),
        }
      : {}),
  });

  return session_id;
}

export interface FinalizeAuthenticatedSessionParams extends AuthenticateLoginSessionParams {
  /** Strategy metadata persisted so /authorize/resume can rehydrate it */
  authStrategy?: { strategy: string; strategy_type: string };
}

/**
 * Persist an authenticated identity onto the login session and 302 the browser
 * to `/authorize/resume?state=…`. This is the terminal step for sub-flows
 * (social callback, UL password/OTP/signup, SAML SP-ACS, etc.) — instead of
 * issuing tokens and setting the session cookie inline, they persist enough
 * state for the resume endpoint to do it on the correct domain.
 *
 * Mirrors Auth0's pattern where /u/login/{password,…} 302s to /authorize/resume.
 */
export async function finalizeAuthenticatedSession(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: FinalizeAuthenticatedSessionParams,
): Promise<Response> {
  const { user, client, loginSession, authStrategy, authConnection } = params;

  await authenticateLoginSession(ctx, {
    user,
    client,
    loginSession,
    existingSessionId: params.existingSessionId,
    authConnection,
  });

  // Persist strategy + timestamp so /authorize/resume can reconstruct the call
  // to createFrontChannelAuthResponse without the sub-flow having to keep
  // authStrategy in memory across the redirect.
  await ctx.env.data.loginSessions.update(client.tenant.id, loginSession.id, {
    ...(authStrategy ? { auth_strategy: authStrategy } : {}),
    authenticated_at: new Date().toISOString(),
  });

  // If the authorize request came in on a different host (e.g. a tenant
  // custom domain), send the browser to /authorize/resume on THAT host so the
  // session cookie lands under the right wildcard. Falls back to a relative
  // redirect otherwise.
  const resumePath = `/authorize/resume?state=${encodeURIComponent(loginSession.id)}`;
  let location = resumePath;
  if (loginSession.authorization_url) {
    try {
      const authzUrl = new URL(loginSession.authorization_url);
      const currentHost = ctx.var.host || "";
      if (authzUrl.host && authzUrl.host !== currentHost) {
        location = `${authzUrl.origin}${resumePath}`;
      }
    } catch {
      // Malformed authorization_url — just use the relative path.
    }
  }

  return new Response(null, {
    status: 302,
    headers: {
      location,
    },
  });
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
  auth_connection?: string,
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
      ...(auth_connection ? { auth_connection } : {}),
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
    // Merge continuation keys with existing state_data to preserve flags like mfa_verified
    let existingData: Record<string, unknown> = {};
    if (currentSession.state_data) {
      try {
        existingData = JSON.parse(currentSession.state_data);
      } catch {
        // ignore parse errors
      }
    }

    await ctx.env.data.loginSessions.update(tenantId, loginSession.id, {
      state: newState,
      state_data: JSON.stringify({
        ...existingData,
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

  // Parse state_data to get return URL and preserve non-continuation keys
  let returnUrl: string | undefined;
  let restoredData: Record<string, unknown> = {};
  if (currentSession.state_data) {
    try {
      const data = JSON.parse(currentSession.state_data);
      returnUrl = data.continuationReturnUrl;
      // Remove only continuation-specific keys, preserve the rest
      const {
        continuationScope: _scope,
        continuationReturnUrl: _url,
        ...rest
      } = data;
      restoredData = rest;
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
      state_data:
        Object.keys(restoredData).length > 0
          ? JSON.stringify(restoredData)
          : undefined,
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
  /** The connection name used for authentication (e.g., "email", "google-oauth2") */
  authConnection?: string;
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
    // EXPIRED sessions are NOT rejected here — if we got this far, the OAuth
    // exchange succeeded and we have a valid user. The TTL expiry should only
    // block new auth attempts, not in-flight completions.

    // If state is PENDING or EXPIRED, we need to authenticate
    if (
      currentState === LoginSessionState.PENDING ||
      currentState === LoginSessionState.EXPIRED
    ) {
      session_id = await authenticateLoginSession(ctx, {
        user,
        client,
        loginSession: params.loginSession,
        existingSessionId: params.existingSessionIdToLink,
        authConnection: params.authConnection,
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

  // ============================================================================
  // MFA CHECK
  // ============================================================================
  // After authentication, check if the tenant requires MFA.
  // If MFA is required and user hasn't completed it yet, redirect to MFA flow.
  // ============================================================================
  if (params.loginSession && user) {
    const currentLoginSession = await ctx.env.data.loginSessions.get(
      client.tenant.id,
      params.loginSession.id,
    );

    if (currentLoginSession) {
      const currentState =
        currentLoginSession.state || LoginSessionState.PENDING;
      let stateData: Record<string, unknown> = {};
      if (currentLoginSession.state_data) {
        try {
          stateData = JSON.parse(currentLoginSession.state_data);
        } catch {
          console.error(
            "Failed to parse state_data for login session",
            currentLoginSession.id,
          );
        }
      }

      // If state is AWAITING_MFA, user needs to complete MFA
      if (currentState === LoginSessionState.AWAITING_MFA) {
        let targetPath = "/u2/mfa/login-options";
        if (stateData.authenticationMethodId) {
          const enrollments = await ctx.env.data.authenticationMethods.list(
            client.tenant.id,
            user.user_id,
          );
          const enrollment = enrollments.find(
            (e) => e.id === stateData.authenticationMethodId,
          );
          if (enrollment?.confirmed && enrollment.type === "phone") {
            targetPath = "/u2/mfa/phone-challenge";
          } else if (enrollment?.confirmed && enrollment.type === "totp") {
            targetPath = "/u2/mfa/totp-challenge";
          } else if (
            enrollment?.confirmed &&
            (enrollment.type === "passkey" ||
              enrollment.type === "webauthn-roaming" ||
              enrollment.type === "webauthn-platform")
          ) {
            targetPath = "/u2/passkey/challenge";
          } else if (enrollment?.type === "totp") {
            targetPath = "/u2/mfa/totp-enrollment";
          } else if (enrollment?.type === "phone") {
            targetPath = "/u2/mfa/phone-enrollment";
          }
        }
        return new Response(null, {
          status: 302,
          headers: {
            location: `${targetPath}?state=${encodeURIComponent(params.loginSession.id)}`,
          },
        });
      }

      // If state is AUTHENTICATED and MFA hasn't been verified yet, check if MFA is required
      if (
        currentState === LoginSessionState.AUTHENTICATED &&
        !stateData.mfa_verified
      ) {
        const { checkMfaRequired, sendMfaOtp } = await import("./mfa");
        const mfaCheck = await checkMfaRequired(
          ctx,
          client.tenant.id,
          user.user_id,
        );

        if (mfaCheck.required) {
          // Transition to AWAITING_MFA
          const { state: newState } = transitionLoginSession(
            LoginSessionState.AUTHENTICATED,
            { type: LoginSessionEventType.REQUIRE_MFA },
          );

          if (!mfaCheck.enrolled) {
            // User needs to enroll - determine which factor to use
            const tenant = client.tenant;
            const hasOtp = tenant.mfa?.factors?.otp === true;
            const hasSms = tenant.mfa?.factors?.sms === true;
            const hasWebauthn =
              tenant.mfa?.factors?.webauthn_roaming === true ||
              tenant.mfa?.factors?.webauthn_platform === true;

            await ctx.env.data.loginSessions.update(
              client.tenant.id,
              params.loginSession.id,
              {
                state: newState,
              },
            );

            // If multiple factors available, show selection screen
            const enabledFactorCount =
              (hasOtp ? 1 : 0) + (hasSms ? 1 : 0) + (hasWebauthn ? 1 : 0);
            if (enabledFactorCount > 1) {
              return new Response(null, {
                status: 302,
                headers: {
                  location: `/u2/mfa/login-options?state=${encodeURIComponent(params.loginSession.id)}`,
                },
              });
            }

            if (hasOtp) {
              // Redirect to TOTP enrollment
              return new Response(null, {
                status: 302,
                headers: {
                  location: `/u2/mfa/totp-enrollment?state=${encodeURIComponent(params.loginSession.id)}`,
                },
              });
            }

            if (hasWebauthn) {
              // Redirect to passkey enrollment
              return new Response(null, {
                status: 302,
                headers: {
                  location: `/u2/passkey/enrollment?state=${encodeURIComponent(params.loginSession.id)}`,
                },
              });
            }

            // Default to phone enrollment
            return new Response(null, {
              status: 302,
              headers: {
                location: `/u2/mfa/phone-enrollment?state=${encodeURIComponent(params.loginSession.id)}`,
              },
            });
          } else {
            // User is enrolled - check if multiple factors exist
            if (mfaCheck.allEnrollments.length > 1) {
              // Multiple enrollments - show selection screen
              await ctx.env.data.loginSessions.update(
                client.tenant.id,
                params.loginSession.id,
                {
                  state: newState,
                },
              );

              return new Response(null, {
                status: 302,
                headers: {
                  location: `/u2/mfa/login-options?state=${encodeURIComponent(params.loginSession.id)}`,
                },
              });
            }

            // Single enrollment - redirect directly to challenge
            await ctx.env.data.loginSessions.update(
              client.tenant.id,
              params.loginSession.id,
              {
                state: newState,
                state_data: JSON.stringify({
                  ...stateData,
                  authenticationMethodId: mfaCheck.enrollment.id,
                }),
              },
            );

            if (mfaCheck.enrollment.type === "totp") {
              // Redirect to TOTP challenge
              return new Response(null, {
                status: 302,
                headers: {
                  location: `/u2/mfa/totp-challenge?state=${encodeURIComponent(params.loginSession.id)}`,
                },
              });
            }

            if (
              mfaCheck.enrollment.type === "passkey" ||
              mfaCheck.enrollment.type === "webauthn-roaming" ||
              mfaCheck.enrollment.type === "webauthn-platform"
            ) {
              return new Response(null, {
                status: 302,
                headers: {
                  location: `/u2/passkey/challenge?state=${encodeURIComponent(params.loginSession.id)}`,
                },
              });
            }

            // Phone enrollment - send OTP and redirect
            if (!mfaCheck.enrollment.phone_number) {
              throw new Error("MFA enrollment is missing phone_number");
            }

            await sendMfaOtp(
              ctx,
              client,
              params.loginSession,
              mfaCheck.enrollment.phone_number,
            );

            return new Response(null, {
              status: 302,
              headers: {
                location: `/u2/mfa/phone-challenge?state=${encodeURIComponent(params.loginSession.id)}`,
              },
            });
          }
        }
      }
    }
  }

  // ============================================================================
  // PASSKEY ENROLLMENT NUDGE CHECK
  // ============================================================================
  // After MFA, check if we should nudge the user to enroll a passkey.
  // Only shown for interactive flows (not silent auth / web_message).
  // ============================================================================
  if (
    params.loginSession &&
    user &&
    responseMode !== AuthorizationResponseMode.WEB_MESSAGE
  ) {
    const currentLoginSession = await ctx.env.data.loginSessions.get(
      client.tenant.id,
      params.loginSession.id,
    );

    if (currentLoginSession) {
      const currentState =
        currentLoginSession.state || LoginSessionState.PENDING;
      let stateData: Record<string, unknown> = {};
      if (currentLoginSession.state_data) {
        try {
          stateData = JSON.parse(currentLoginSession.state_data);
        } catch {
          // ignore parse errors
        }
      }

      if (
        currentState === LoginSessionState.AUTHENTICATED &&
        !stateData.passkey_nudge_completed
      ) {
        const { checkPasskeyNudgeRequired } =
          await import("./passkey-enrollment");
        const nudgeCheck = await checkPasskeyNudgeRequired(
          ctx,
          client.tenant.id,
          user.user_id,
          currentLoginSession.auth_connection,
        );

        if (nudgeCheck.show) {
          // Use continuation mechanism to pause login flow
          await startLoginSessionContinuation(
            ctx,
            client.tenant.id,
            currentLoginSession,
            ["passkey-enrollment"],
            `/u/continue?state=${encodeURIComponent(params.loginSession.id)}`,
          );

          return new Response(null, {
            status: 302,
            headers: {
              location: `/u2/passkey/enrollment-nudge?state=${encodeURIComponent(params.loginSession.id)}`,
            },
          });
        } else {
          // Mark nudge as completed so we don't re-check on re-entry
          await ctx.env.data.loginSessions.update(
            client.tenant.id,
            params.loginSession.id,
            {
              state_data: JSON.stringify({
                ...stateData,
                passkey_nudge_completed: true,
              }),
            },
          );
        }
      }
    }
  }

  // If a refresh token wasn't passed in (or already set) and 'offline_access' is in the current authParams.scope, create one.
  // Don't create refresh tokens for impersonated users for security reasons.
  // For any response_type that includes a `code` (basic + hybrid), the code
  // exchange at /oauth/token will issue the refresh token — skip here to
  // avoid double-issuance. Pure implicit `token` also skips (refresh tokens
  // were never intended for the implicit grant).
  const responseTypeIncludesCode = responseType.split(" ").includes("code");
  if (
    !refresh_token &&
    authParams.scope?.split(" ").includes("offline_access") &&
    responseType !== AuthorizationResponseType.TOKEN &&
    !responseTypeIncludesCode &&
    !params.impersonatingUser
  ) {
    const newRefreshToken = await createRefreshToken(ctx, {
      user,
      client,
      login_id: params.loginSession?.id || "",
      scope: authParams.scope,
      audience: authParams.audience,
    });
    refresh_token = newRefreshToken.wireToken;
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
    authConnection: params.authConnection,
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

  if (!authParams.redirect_uri) {
    throw new JSONHTTPException(400, {
      message:
        responseMode === AuthorizationResponseMode.WEB_MESSAGE
          ? "Redirect URI not allowed for WEB_MESSAGE response mode."
          : "Redirect uri not found for this response mode.",
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
  } else if (responseMode === AuthorizationResponseMode.WEB_MESSAGE) {
    console.warn(
      "Session ID not available for WEB_MESSAGE, cookie will not be set.",
    );
  }

  // Build the response parameter set once; query/fragment/form_post and
  // WEB_MESSAGE all carry the same params, just transported differently per
  // OIDC §3.1.2.5 and the OAuth 2.0 Form Post Response Mode spec. Inclusion
  // is driven by the response_type set: only fields the client asked for are
  // emitted, even when completeLogin produces extras (e.g. hybrid `code
  // id_token` won't expose the internally-issued access_token, and the
  // refresh_token never reaches the front channel).
  const responseTypeTokens = responseType.split(" ");
  const wantsCode = responseTypeTokens.includes("code");
  const wantsIdToken = responseTypeTokens.includes("id_token");
  const wantsAccessToken = responseTypeTokens.includes("token");

  const responseParams: Record<string, string> = {};
  const hasCode = "code" in tokens && typeof tokens.code === "string";
  const hasAccessToken =
    "access_token" in tokens && typeof tokens.access_token === "string";

  if (hasCode && wantsCode) {
    responseParams.code = tokens.code;
  }
  if (hasAccessToken) {
    if (wantsAccessToken) {
      responseParams.access_token = tokens.access_token;
      responseParams.token_type = tokens.token_type;
      responseParams.expires_in = tokens.expires_in.toString();
    }
    if (wantsIdToken && tokens.id_token) {
      responseParams.id_token = tokens.id_token;
    }
  }
  if (!hasCode && !hasAccessToken) {
    throw new JSONHTTPException(500, {
      message: "Invalid token response for front-channel flow.",
    });
  }
  // `state` echo: code-only responses carry the state on the code object;
  // every other flow uses authParams.state. Either way echo it when present.
  const stateOnTokens =
    "state" in tokens && typeof tokens.state === "string"
      ? tokens.state
      : undefined;
  const echoState = stateOnTokens ?? authParams.state;
  if (echoState) responseParams.state = echoState;
  if ((wantsAccessToken || wantsIdToken) && authParams.scope) {
    responseParams.scope = authParams.scope;
  }

  if (responseMode === AuthorizationResponseMode.WEB_MESSAGE) {
    const redirectURL = new URL(authParams.redirect_uri);
    const originUrl = `${redirectURL.protocol}//${redirectURL.host}`;
    return renderAuthIframe(
      ctx,
      originUrl,
      JSON.stringify(responseParams),
      headers,
    );
  }

  if (responseMode === AuthorizationResponseMode.FORM_POST) {
    return formPostResponse(authParams.redirect_uri, responseParams, headers);
  }

  // OIDC Core 3.3.2.5 / 3.2.2.5: any response that carries a front-channel
  // token (id_token or access_token) goes in the fragment so it never reaches
  // server logs. Pure code responses use the query.
  const useFragment = wantsIdToken || wantsAccessToken;
  const redirectUri = new URL(authParams.redirect_uri);
  if (useFragment) {
    redirectUri.hash = new URLSearchParams(responseParams).toString();
  } else {
    for (const [k, v] of Object.entries(responseParams)) {
      redirectUri.searchParams.set(k, v);
    }
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
  params: Omit<CreateAuthTokensParams, "client"> & {
    client: EnrichedClient;
    responseType?: AuthorizationResponseType;
  },
): Promise<
  | TokenResponse
  | { code: string; state?: string }
  | (TokenResponse & { code: string })
  | Response
> {
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
  let calculatedTokenLifetime: number | undefined;

  // Fall back to the userinfo aud so the scopes-permissions security check
  // (which rejects non-OIDC scopes when no resource server matches) still
  // runs for audience-less requests. Without this fallback, omitting
  // audience would silently bypass scope validation.
  const iss = getIssuer(ctx.env, ctx.var.custom_domain);
  const resolvedAudience =
    params.authParams.audience ??
    params.client.tenant.default_audience ??
    `${iss}userinfo`;

  if (resolvedAudience) {
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
          audience: resolvedAudience,
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
          audience: resolvedAudience,
          requestedScopes: params.authParams.scope?.split(" ") || [],
          organizationId: params.organization?.id,
        });
      }

      calculatedScopes = scopesAndPermissions.scopes.join(" ");
      calculatedPermissions = scopesAndPermissions.permissions;

      // Use token_lifetime_for_web for SPA clients, token_lifetime for all others
      calculatedTokenLifetime =
        params.client.app_type === "spa" &&
        scopesAndPermissions.token_lifetime_for_web
          ? scopesAndPermissions.token_lifetime_for_web
          : scopesAndPermissions.token_lifetime;
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

  // Resolve the connection used for authentication. No user fallback: this
  // feeds completeLoginSession, which persists the session's authoritative
  // auth_connection — we never store a guess from the user record. The
  // user-record fallback is applied only at the hook-event layer in
  // createAuthTokens.
  const authConnection = resolveConnectionName({
    loginSession: params.loginSession,
    authConnection: params.authConnection,
    ctxConnection: ctx.var.connection,
  });

  // Return code, tokens, or both (hybrid) based on response_type.
  // Note: completeLoginSession is called AFTER successful creation to avoid
  // marking session as COMPLETED if token/code creation fails.
  const responseTypeTokens = responseType.split(" ");
  const issuesCode = responseTypeTokens.includes("code");
  const issuesFrontChannelToken =
    responseTypeTokens.includes("id_token") ||
    responseTypeTokens.includes("token");
  const isHybrid = issuesCode && issuesFrontChannelToken;

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
      authConnection,
    );

    return codeData;
  } else if (isHybrid) {
    if (!user || !params.loginSession) {
      throw new JSONHTTPException(500, {
        message: "User and loginSession is required for hybrid flow",
      });
    }
    // Issue the code first so c_hash can be computed inside createAuthTokens.
    const codeData = await createCodeData(ctx, {
      user,
      client: params.client,
      authParams: updatedAuthParams,
      login_id: params.loginSession.id,
    });

    const tokens = await createAuthTokens(ctx, {
      ...params,
      user,
      authParams: updatedAuthParams,
      permissions: calculatedPermissions,
      token_lifetime: calculatedTokenLifetime,
      code: codeData.code,
    });

    await completeLoginSession(
      ctx,
      params.client.tenant.id,
      params.loginSession,
      authConnection,
    );

    return { ...tokens, code: codeData.code, state: codeData.state };
  } else {
    const tokens = await createAuthTokens(ctx, {
      ...params,
      user,
      authParams: updatedAuthParams,
      permissions: calculatedPermissions,
      token_lifetime: calculatedTokenLifetime,
    });

    // Mark login session as completed after successful token creation
    if (params.loginSession) {
      await completeLoginSession(
        ctx,
        params.client.tenant.id,
        params.loginSession,
        authConnection,
      );
    }

    return tokens;
  }
}
