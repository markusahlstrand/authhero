import { AuthParams, Client, User } from "@authhero/adapter-interfaces";
import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { TimeSpan } from "oslo";
import { createJWT } from "oslo/jwt";
import { pemToBuffer } from "../utils/crypto";
import { Bindings, Variables } from "../types";

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
