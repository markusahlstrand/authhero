import {
  AuthorizationResponseMode,
  AuthorizationResponseType,
  AuthParams,
  Client,
  LoginSession,
  User,
  LogTypes,
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
import { waitUntil } from "../helpers/wait-until";
import { createLogMessage } from "../utils/create-log-message";
import { postUserLoginHook } from "../hooks/index";
import { getClientInfo } from "../utils/client-info";

export interface CreateAuthTokensParams {
  authParams: AuthParams;
  client: Client;
  user?: User;
  session_id?: string;
  refresh_token?: string;
}

const RESERVED_CLAIMS = ["sub", "iss", "aud", "exp", "nbf", "iat", "jti"];

export async function createAuthTokens(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: CreateAuthTokensParams,
): Promise<TokenResponse> {
  const { authParams, user, client, session_id } = params;

  const signingKeys = await ctx.env.data.keys.list();
  const validKeys = signingKeys.filter(
    (key) => !key.revoked_at || new Date(key.revoked_at) > new Date(),
  );
  const signingKey = validKeys[validKeys.length - 1];

  if (!signingKey?.pkcs7) {
    throw new HTTPException(500, { message: "No signing key available" });
  }

  const keyBuffer = pemToBuffer(signingKey.pkcs7);
  const iss = ctx.var.custom_domain
    ? `https://${ctx.var.custom_domain}/`
    : ctx.env.ISSUER;

  const accessTokenPayload = {
    // TODO: consider if the dafault should be removed
    aud: authParams.audience || "default",
    scope: authParams.scope || "",
    sub: user?.user_id || authParams.client_id,
    iss,
    tenant_id: ctx.var.tenant_id,
    sid: session_id,
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
        }
      : undefined;

  if (ctx.env.hooks?.onExecuteCredentialsExchange) {
    await ctx.env.hooks.onExecuteCredentialsExchange(
      {
        ctx,
        client,
        user,
        request: {
          ip: ctx.req.header("x-real-ip") || "",
          user_agent: ctx.req.header("user-agent") || "",
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
            throw new HTTPException(400, {
              message: `Access denied: ${code}`,
            });
          },
        },
      },
    );
  }

  const header = {
    includeIssuedTimestamp: true,
    expiresIn: new TimeSpan(1, "d"),
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
    expires_in: 86400,
  };
}

export interface CreateCodeParams {
  user: User;
  client: Client;
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
  });

  return {
    code: code.code_id,
    state: params.authParams.state,
  };
}

export interface CreateRefreshTokenParams {
  user: User;
  client: Client;
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

  const clientInfo = getClientInfo(ctx.req);

  const refreshToken = await ctx.env.data.refreshTokens.create(
    client.tenant.id,
    {
      id: nanoid(),
      session_id,
      client_id: client.id,
      idle_expires_at: new Date(
        Date.now() + SILENT_AUTH_MAX_AGE_IN_SECONDS * 1000,
      ).toISOString(),
      user_id: params.user.user_id,
      device: {
        last_ip: clientInfo.ip || "",
        initial_ip: clientInfo.ip || "",
        last_user_agent: clientInfo.useragent || "",
        initial_user_agent: clientInfo.useragent || "",
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
  client: Client;
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
      last_ip: ctx.req.header("x-real-ip") || "",
      initial_ip: ctx.req.header("x-real-ip") || "",
      last_user_agent: ctx.req.header("user-agent") || "",
      initial_user_agent: ctx.req.header("user-agent") || "",
      // TODO: add Authentication Strength Name
      initial_asn: "",
      last_asn: "",
    },
    clients: [client.id],
  });

  // Store the session id in the login session
  await ctx.env.data.loginSessions.update(client.tenant.id, loginSession.id, {
    session_id: session.id,
  });

  return session;
}

export interface CreateAuthResponseParams {
  authParams: AuthParams;
  client: Client;
  user: User;
  loginSession?: LoginSession;
  sessionId?: string;
  refreshToken?: string;
  ticketAuth?: boolean;
}

export async function createAuthResponse(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: CreateAuthResponseParams,
): Promise<TokenResponse | Response> {
  const { authParams, user, client, ticketAuth } = params;

  const logMessage = createLogMessage(ctx, {
    type: LogTypes.SUCCESS_LOGIN,
    description: `Successful login for ${user.user_id}`,
    userId: user.user_id,
  });

  waitUntil(ctx, ctx.env.data.logs.create(client.tenant.id, logMessage));

  // Update the users last login info
  waitUntil(
    ctx,
    ctx.env.data.users.update(client.tenant.id, user.user_id, {
      last_login: new Date().toISOString(),
      last_ip: ctx.req.header("x-real-ip") || "",
      login_count: user.login_count + 1,
    }),
  );

  if (ticketAuth) {
    if (!params.loginSession) {
      throw new HTTPException(500, {
        message: "Login session not found for ticket auth.",
      });
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

  let postHookUser = user;

  if (!session_id && params.loginSession?.session_id) {
    // Scenario 1: Reusing an existing session indicated by loginSession.session_id
    session_id = params.loginSession.session_id;
    const existingSession = await ctx.env.data.sessions.get(
      client.tenant.id,
      session_id,
    );

    // Ensure the client is associated with the existing session
    if (existingSession && !existingSession.clients.includes(client.id)) {
      await ctx.env.data.sessions.update(client.tenant.id, session_id, {
        clients: [...existingSession.clients, client.id],
      });
    }

    // If a refresh token wasn't passed in (or already set) and 'offline_access' is in the current authParams.scope, create one.
    if (
      !refresh_token &&
      authParams.scope?.split(" ").includes("offline_access")
    ) {
      const newRefreshToken = await createRefreshToken(ctx, {
        user: postHookUser,
        client,
        session_id,
        scope: authParams.scope,
        audience: authParams.audience,
      });
      refresh_token = newRefreshToken.id;
    }
  } else if (!session_id) {
    // Scenario 2: Creating a new session
    if (!params.loginSession) {
      throw new HTTPException(500, {
        message: "Login session not found for creating a new session.",
      });
    }

    const newSession = await createSession(ctx, {
      user: postHookUser,
      client,
      loginSession: params.loginSession,
    });
    session_id = newSession.id;

    // Use the unified postUserLoginHook for all post-login logic
    const postLoginResult = await postUserLoginHook(
      ctx,
      ctx.env.data,
      client.tenant.id,
      user,
      params.loginSession,
      { client, authParams },
    );

    // If the hook returns a user, use it; if it returns a Response (redirect), throw or handle as needed
    if (postLoginResult instanceof Response) {
      return postLoginResult;
    }

    postHookUser = postLoginResult;
  }

  if (params.authParams.response_mode === AuthorizationResponseMode.SAML_POST) {
    if (!session_id) {
      throw new HTTPException(500, {
        message: "Session ID not available for SAML response",
      });
    }
    return samlCallback(
      ctx,
      params.client,
      params.authParams,
      postHookUser,
      session_id,
    );
  }

  const tokens = await createAuthTokens(ctx, {
    authParams,
    user: postHookUser,
    client,
    session_id,
    refresh_token: refresh_token, // Pass the determined refresh token ID
  });

  if (authParams.response_mode === AuthorizationResponseMode.WEB_MESSAGE) {
    if (session_id) {
      const authCookie = serializeAuthCookie(
        client.tenant.id,
        session_id,
        ctx.var.custom_domain || ctx.req.header("host") || "",
      );
      if (authCookie) {
        ctx.header("set-cookie", authCookie);
      }
    } else {
      console.warn(
        "Session ID not available for WEB_MESSAGE, cookie will not be set.",
      );
    }
    return tokens; // Return TokenResponse directly
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

  const responseType =
    authParams.response_type || AuthorizationResponseType.CODE;

  if (responseType === AuthorizationResponseType.CODE) {
    if (!params.loginSession) {
      throw new HTTPException(500, {
        message: "Login session not found for code response type.",
      });
    }
    const codeData = await createCodeData(ctx, {
      user: postHookUser,
      client,
      authParams,
      login_id: params.loginSession.id,
    });

    if (!authParams.redirect_uri) {
      throw new HTTPException(400, {
        message: "Redirect uri not found for code response type.",
      });
    }

    const redirectUri = new URL(authParams.redirect_uri);
    redirectUri.searchParams.set("code", codeData.code);
    if (codeData.state) {
      redirectUri.searchParams.set("state", codeData.state);
    }
    headers.set("location", redirectUri.toString());
    return new Response("Redirecting", {
      status: 302,
      headers,
    });
  }

  // Fallback for other redirect-based responses (e.g., implicit flow style)
  if (!authParams.redirect_uri) {
    throw new HTTPException(400, {
      message: "Redirect uri not found for this response mode.",
    });
  }
  const redirectUri = new URL(authParams.redirect_uri);

  if (
    responseType === AuthorizationResponseType.TOKEN ||
    responseType === AuthorizationResponseType.TOKEN_ID_TOKEN
  ) {
    redirectUri.hash = new URLSearchParams({
      access_token: tokens.access_token,
      ...(tokens.id_token && { id_token: tokens.id_token }),
      token_type: tokens.token_type,
      expires_in: tokens.expires_in.toString(),
      ...(authParams.state && { state: authParams.state }),
      ...(authParams.scope && { scope: authParams.scope }),
    }).toString();
  } else {
    // This case should ideally be narrowed down or handled if there are other valid response_types
    // that lead to a redirect with tokens in the URL.
    throw new HTTPException(500, {
      message: `Unsupported response type ('${responseType}') for redirect with tokens.`,
    });
  }

  headers.set("location", redirectUri.toString());
  return new Response("Redirecting", {
    status: 302,
    headers,
  });
}

// Wrapper to trigger OnExecutePostLogin before issuing tokens
export async function completeLogin(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: CreateAuthTokensParams,
): Promise<TokenResponse> {
  let user = params.user;

  // Use the unified postUserLoginHook for all post-login logic
  if (user) {
    await postUserLoginHook(
      ctx,
      ctx.env.data,
      params.client.tenant.id,
      user,
      ctx.var.loginSession,
      { client: params.client, authParams: params.authParams },
    );
  }

  // Call createAuthTokens with possibly updated user
  return createAuthTokens(ctx, { ...params, user });
}
