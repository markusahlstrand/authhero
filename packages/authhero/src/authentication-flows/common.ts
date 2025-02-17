import {
  AuthorizationResponseMode,
  AuthorizationResponseType,
  AuthParams,
  Client,
  Login,
  User,
  LogTypes,
  TokenResponse,
} from "@authhero/adapter-interfaces";
import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { TimeSpan } from "oslo";
import { createJWT } from "oslo/jwt";
import { nanoid } from "nanoid";
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
import { generateCodeVerifier } from "oslo/oauth2";

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

  const accessTokenPayload = {
    // TODO: consider if the dafault should be removed
    aud: authParams.audience || "default",
    scope: authParams.scope || "",
    sub: user?.user_id || authParams.client_id,
    iss: ctx.env.ISSUER,
    tenant_id: ctx.var.tenant_id,
    sid: session_id,
  };

  const idTokenPayload =
    user && authParams.scope?.split(" ").includes("openid")
      ? {
          // The audience for an id token is the client id
          aud: authParams.client_id,
          sub: user.user_id,
          iss: ctx.env.ISSUER,
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
  scope?: string;
  audience?: string;
}

export async function createSession(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: CreateSessionParams,
) {
  const { user, client, scope, audience } = params;
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

  const refresh_token = scope?.split(" ").includes("offline_access")
    ? await createRefreshToken(ctx, {
        ...params,
        session_id: session.id,
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
  loginSession?: Login;
  sessionId?: string;
  refreshToken?: string;
  ticketAuth?: boolean;
}

export async function createAuthResponse(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: CreateAuthResponseParams,
) {
  const { authParams, user, client } = params;

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

  if (params?.ticketAuth) {
    console.log("ticketAuth" + params.loginSession);

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
      login_id: params.loginSession.login_id,
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

  // If there is no session id, create a new session
  if (!session_id) {
    const session = await createSession(ctx, {
      user,
      client,
      scope: authParams.scope,
      audience: authParams.audience,
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
      user,
      session_id,
    );
  }

  const tokens = await createAuthTokens(ctx, {
    authParams,
    user,
    client,
    session_id,
    refresh_token,
  });

  const headers = new Headers({
    "set-cookie": serializeAuthCookie(client.tenant.id, session_id),
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
    if (!params.loginSession) {
      // The login session needs to be present to generate a code, but for instance not in the case of a silent auth
      throw new HTTPException(500, {
        message: "Login session not found",
      });
    }

    const code = await ctx.env.data.codes.create(client.tenant.id, {
      code_id: nanoid(),
      user_id: user.user_id,
      code_type: "authorization_code",
      login_id: params.loginSession.login_id,
      expires_at: new Date(
        Date.now() + AUTHORIZATION_CODE_EXPIRES_IN_SECONDS * 1000,
      ).toISOString(),
    });

    headers.set(
      "location",
      `${authParams.redirect_uri}?state=${params.authParams.state}&code=${code.code_id}`,
    );
  }

  return new Response("Redirecting", {
    status: 302,
    headers,
  });
}
