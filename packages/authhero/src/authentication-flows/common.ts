import { AuthParams } from "@authhero/adapter-interfaces";
import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { TimeSpan } from "oslo";
import { createJWT } from "oslo/jwt";
import { pemToBuffer } from "src/utils/crypto";

export async function createAuthTokens(
  ctx: Context,
  authParams: AuthParams,
  sub: string,
) {
  const signingKeys = await ctx.env.data.keys.list();
  const signingKey = signingKeys[signingKeys.length - 1];

  if (!signingKey?.pkcs7) {
    throw new HTTPException(500, { message: "No signing key available" });
  }

  const keyBuffer = pemToBuffer(signingKey.pkcs7);

  const accessToken = await createJWT(
    "RS256",
    keyBuffer,
    {
      aud: authParams.audience || "default",
      scope: authParams.scope || "",
      sub,
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

  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 86400,
  };
}
