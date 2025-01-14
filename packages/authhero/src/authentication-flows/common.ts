import {
  AuthorizationResponseMode,
  AuthorizationResponseType,
  AuthParams,
  Client,
  Login,
  User,
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
  SILENT_AUTH_MAX_AGE,
} from "../constants";
import { serializeAuthCookie } from "../utils/cookies";

export interface CreateAuthTokensParams {
  authParams: AuthParams;
  client: Client;
  user?: User;
  sid?: string;
}

const RESERVED_CLAIMS = ["sub", "iss", "aud", "exp", "nbf", "iat", "jti"];

export async function createAuthTokens(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: CreateAuthTokensParams,
) {
  const { authParams, user, client, sid } = params;

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
    sid,
  };

  const idTokenPayload =
    user && authParams.scope?.split(" ").includes("openid")
      ? {
          // The audience for an id token is the client id
          aud: authParams.client_id,
          sub: user.user_id,
          iss: ctx.env.ISSUER,
          sid,
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
    id_token,
    token_type: "Bearer",
    expires_in: 86400,
  };
}

export async function createSession(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  user: User,
  client: Client,
) {
  // Create a new session
  const session = await ctx.env.data.sessions.create(client.tenant.id, {
    session_id: nanoid(),
    user_id: user.user_id,
    client_id: client.id,
    expires_at: new Date(Date.now() + SILENT_AUTH_MAX_AGE * 1000).toISOString(),
    used_at: new Date().toISOString(),
  });

  return session;
}

export interface CreateAuthResponseParams {
  authParams: AuthParams;
  client: Client;
  user: User;
  loginSession?: Login;
  sid?: string;
}

export async function createAuthResponse(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: CreateAuthResponseParams,
) {
  const { authParams, user, client } = params;

  const sid = params.sid || (await createSession(ctx, user, client)).session_id;

  const tokens = await createAuthTokens(ctx, {
    authParams,
    user,
    client,
    sid,
  });

  const headers = new Headers({
    "set-cookie": serializeAuthCookie(client.tenant.id, sid),
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
