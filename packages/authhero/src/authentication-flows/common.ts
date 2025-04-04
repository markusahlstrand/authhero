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
  UNIVERSAL_AUTH_SESSION_EXPIRES_IN_SECONDS,
} from "../constants";
import { serializeAuthCookie } from "../utils/cookies";
import { samlCallback } from "../strategies/saml";
import { waitUntil } from "../helpers/wait-until";
import { createLogMessage } from "../utils/create-log-message";
import { postUserLoginWebhook } from "../hooks/webhooks";
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
  loginSession?: LoginSession;
  authParams: AuthParams;
}

export async function createCodeData(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: CreateCodeParams,
) {
  if (!params.loginSession) {
    // This is a short term solution to create codes for silent auth where the login session isn't available.
    // Maybe a code could be connected to either a login session or a session in the future?
    params.loginSession = await ctx.env.data.loginSessions.create(
      params.client.tenant.id,
      {
        expires_at: new Date(
          Date.now() + UNIVERSAL_AUTH_SESSION_EXPIRES_IN_SECONDS * 1000,
        ).toISOString(),
        authParams: params.authParams,
        authorization_url: ctx.req.url,
        csrf_token: nanoid(),
        ...getClientInfo(ctx.req),
      },
    );
  }

  const code = await ctx.env.data.codes.create(params.client.tenant.id, {
    code_id: nanoid(),
    user_id: params.user.user_id,
    code_type: "authorization_code",
    login_id: params.loginSession.id,
    expires_at: new Date(
      Date.now() + AUTHORIZATION_CODE_EXPIRES_IN_SECONDS * 1000,
    ).toISOString(),
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

  const refreshToken = await ctx.env.data.refreshTokens.create(
    client.tenant.id,
    {
      id: nanoid(),
      session_id,
      client_id: client.id,
      expires_at: new Date(
        Date.now() + SILENT_AUTH_MAX_AGE_IN_SECONDS * 1000,
      ).toISOString(),
      user_id: params.user.user_id,
      device: {
        last_ip: ctx.req.header("x-real-ip") || "",
        initial_ip: ctx.req.header("x-real-ip") || "",
        last_user_agent: ctx.req.header("user-agent") || "",
        initial_user_agent: ctx.req.header("user-agent") || "",
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

  const { scope, audience } = loginSession.authParams;

  const refresh_token = scope?.split(" ").includes("offline_access")
    ? await createRefreshToken(ctx, {
        session_id: session.id,
        user,
        client,
        scope,
        audience,
      })
    : undefined;

  return { ...session, refresh_token };
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
) {
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
        message: "Login session not found",
      });
    }
    const co_verifier = generateCodeVerifier();
    const co_id = nanoid(12);

    const code = await ctx.env.data.codes.create(client.tenant.id, {
      code_id: nanoid(),
      code_type: "ticket",
      login_id: params.loginSession.id,
      expires_at: new Date(Date.now() + TICKET_EXPIRATION_TIME).toISOString(),
      // Concat the co_id and co_verifier
      code_verifier: [co_id, co_verifier].join("|"),
    });

    return ctx.json({
      login_ticket: code.code_id,
      co_verifier,
      co_id,
    });
  }

  let refresh_token = params.refreshToken;
  let session_id = params.sessionId;

  let postHookUser = user;

  // If there is no session id, create a new session
  if (!session_id) {
    if (!params.loginSession) {
      throw new HTTPException(500, {
        message: "Login session not found",
      });
    }

    postHookUser = await postUserLoginWebhook(ctx, ctx.env.data)(
      client.tenant.id,
      user,
    );

    const session = await createSession(ctx, {
      user,
      client,
      loginSession: params.loginSession,
    });

    session_id = session.id;
    // The refresh token is only returned for new sessions and if the offline_access scope is requested
    refresh_token = session.refresh_token?.id;
  }

  if (params.authParams.response_mode === AuthorizationResponseMode.SAML_POST) {
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
    refresh_token,
  });

  const headers = new Headers({
    "set-cookie": serializeAuthCookie(
      client.tenant.id,
      session_id,
      ctx.req.header("host"),
    ),
  });

  // If it's a web message request, return the tokens in the body
  if (authParams.response_mode === AuthorizationResponseMode.WEB_MESSAGE) {
    return ctx.json(tokens, {
      headers,
    });
  }

  const responseType =
    authParams.response_type || AuthorizationResponseType.CODE;

  // If the response type is code, generate a code and redirect
  if (responseType === AuthorizationResponseType.CODE) {
    const codeData = await createCodeData(ctx, params);

    if (!authParams.redirect_uri) {
      throw new HTTPException(400, {
        message: "Redirect uri not found",
      });
    }

    const redirectUri = new URL(authParams.redirect_uri);
    redirectUri.searchParams.set("code", codeData.code);
    if (codeData.state) {
      redirectUri.searchParams.set("state", codeData.state);
    }

    headers.set("location", redirectUri.toString());
  }

  return new Response("Redirecting", {
    status: 302,
    headers,
  });
}
