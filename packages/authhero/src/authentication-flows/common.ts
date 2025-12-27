import {
  AuthorizationResponseMode,
  AuthorizationResponseType,
  AuthParams,
  LegacyClient,
  LoginSession,
  User,
  TokenResponse,
} from "@authhero/adapter-interfaces";
import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { TimeSpan } from "oslo";
import { createJWT } from "oslo/jwt";
import { nanoid } from "nanoid";
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

export interface CreateAuthTokensParams {
  authParams: AuthParams;
  client: LegacyClient;
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
    org_name:
      organization && client.tenant.allow_organization_name_in_authentication_api
        ? organization.name
        : undefined,
    permissions,
  };

  const idTokenPayload =
    user && authParams.scope?.split(" ").includes("openid")
      ? {
          // The audience for an id token is the client id
          aud: authParams.client_id,
          sub: user.user_id,
          iss,
          sid: session_id,
          nonce: authParams.nonce,
          given_name: user.given_name,
          family_name: user.family_name,
          nickname: user.nickname,
          picture: user.picture,
          locale: user.locale,
          name: user.name,
          email: user.email,
          email_verified: user.email_verified,
          act: impersonatingUser
            ? { sub: impersonatingUser.user_id }
            : undefined,
          org_id: organization?.id,
          org_name: organization?.name,
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
            const { createServiceToken } = await import(
              "../helpers/service-token"
            );
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
  client: LegacyClient;
  authParams: AuthParams;
  login_id: string;
}

export async function createCodeData(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: CreateCodeParams,
) {
  const code = await ctx.env.data.codes.create(params.client.tenant.id, {
    code_id: nanoid(),
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
  client: LegacyClient;
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
      id: nanoid(),
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
  client: LegacyClient;
  loginSession: LoginSession;
}

export async function createSession(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  { user, client, loginSession }: CreateSessionParams,
) {
  // Create a new session
  const session = await ctx.env.data.sessions.create(client.tenant.id, {
    id: nanoid(),
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
      // TODO: add Authentication Strength Name
      initial_asn: "",
      last_asn: "",
    },
    clients: [client.client_id],
  });

  // Store the session id in the login session
  await ctx.env.data.loginSessions.update(client.tenant.id, loginSession.id, {
    session_id: session.id,
  });

  return session;
}

export interface CreateAuthResponseParams {
  authParams: AuthParams;
  client: LegacyClient;
  user: User;
  loginSession?: LoginSession;
  sessionId?: string;
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
      code_id: nanoid(),
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

  // Initialize with params.refreshToken, may be updated based on offline_access scope and session status.
  let refresh_token = params.refreshToken;
  let session_id = params.sessionId;

  if (!session_id && params.loginSession?.session_id) {
    // Scenario 1: Reusing an existing session indicated by loginSession.session_id
    session_id = params.loginSession.session_id;
    const existingSession = await ctx.env.data.sessions.get(
      client.tenant.id,
      session_id,
    );

    // Ensure the client is associated with the existing session
    if (
      existingSession &&
      !existingSession.clients.includes(client.client_id)
    ) {
      await ctx.env.data.sessions.update(client.tenant.id, session_id, {
        clients: [...existingSession.clients, client.client_id],
      });
    }
  } else if (!session_id) {
    // Scenario 2: Creating a new session
    if (!params.loginSession) {
      throw new JSONHTTPException(500, {
        message: "Login session not found for creating a new session.",
      });
    }

    const newSession = await createSession(ctx, {
      user,
      client,
      loginSession: params.loginSession,
    });
    session_id = newSession.id;
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
      const authCookie = serializeAuthCookie(
        client.tenant.id,
        session_id,
        ctx.var.host || "",
      );
      if (authCookie) {
        headers.set("set-cookie", authCookie);
      }
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
    const authCookie = serializeAuthCookie(
      client.tenant.id,
      session_id,
      ctx.var.custom_domain || ctx.req.header("host") || "",
    );
    if (authCookie) {
      headers.set("set-cookie", authCookie);
    }
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
  if (responseType === AuthorizationResponseType.CODE) {
    if (!user || !params.loginSession) {
      throw new JSONHTTPException(500, {
        message: "User and loginSession is required for code flow",
      });
    }
    return await createCodeData(ctx, {
      user,
      client: params.client,
      authParams: updatedAuthParams,
      login_id: params.loginSession.id,
    });
  } else {
    return createAuthTokens(ctx, {
      ...params,
      user,
      authParams: updatedAuthParams,
      permissions: calculatedPermissions,
    });
  }
}
