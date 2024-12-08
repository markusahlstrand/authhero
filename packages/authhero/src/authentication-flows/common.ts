import { AuthParams, User } from "@authhero/adapter-interfaces";
import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { TimeSpan } from "oslo";
import { createJWT } from "oslo/jwt";
import { pemToBuffer } from "src/utils/crypto";

export interface CreateAuthTokensParams {
  authParams: AuthParams;
  user?: User;
  sid?: string;
}

export async function createAuthTokens(
  ctx: Context,
  params: CreateAuthTokensParams,
) {
  const { authParams, user, sid } = params;

  const signingKeys = await ctx.env.data.keys.list();
  const validKeys = signingKeys.filter(
    (key) => !key.revoked_at || new Date(key.revoked_at) > new Date(),
  );
  const signingKey = validKeys[validKeys.length - 1];

  if (!signingKey?.pkcs7) {
    throw new HTTPException(500, { message: "No signing key available" });
  }

  const keyBuffer = pemToBuffer(signingKey.pkcs7);

  const access_token = await createJWT(
    "RS256",
    keyBuffer,
    {
      // TODO: consider if the dafault should be removed
      aud: authParams.audience || "default",
      scope: authParams.scope || "",
      sub: user?.user_id || authParams.client_id,
      iss: ctx.env.ISSUER,
      tenant_id: ctx.var.tenant_id,
    },
    {
      includeIssuedTimestamp: true,
      expiresIn: new TimeSpan(1, "d"),
      headers: {
        kid: signingKey.kid,
      },
    },
  );

  const id_token =
    user && authParams.scope?.split(" ").includes("openid")
      ? await createJWT(
          "RS256",
          keyBuffer,
          {
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
          },
          {
            includeIssuedTimestamp: true,
            expiresIn: new TimeSpan(1, "d"),
            headers: {
              kid: signingKey.kid,
            },
          },
        )
      : undefined;

  return {
    access_token,
    id_token,
    token_type: "Bearer",
    expires_in: 86400,
  };
}