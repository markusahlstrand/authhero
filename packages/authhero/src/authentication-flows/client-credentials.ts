import { Bindings, Variables } from "../types";
import { HTTPException } from "hono/http-exception";
import { Context } from "hono";
import { AuthParams, ClientCredentialsGrantTypeParams } from "authhero";
import { createJWT } from "oslo/jwt";
import { pemToBuffer } from "../utils/crypto";
import { TimeSpan } from "oslo";

export async function clientCredentialsGrant(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: ClientCredentialsGrantTypeParams,
) {
  const client = await ctx.env.data.clients.get(params.client_id);

  if (!client) {
    throw new HTTPException(403, { message: "Invalid client" });
  }

  if (client.client_secret !== params.client_secret) {
    throw new HTTPException(403, { message: "Invalid secret" });
  }

  const authParams: AuthParams = {
    client_id: client.id,
    scope: params.scope,
    redirect_uri: "",
  };

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
      sub: client.id,
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
