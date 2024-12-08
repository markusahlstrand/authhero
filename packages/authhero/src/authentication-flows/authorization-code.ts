import { Bindings, Variables } from "../types";
import { HTTPException } from "hono/http-exception";
import { Context } from "hono";
import {
  AuthParams,
  AuthorizationCodeGrantTypeParams,
} from "@authhero/adapter-interfaces";
import { createJWT } from "oslo/jwt";
import { pemToBuffer } from "../utils/crypto";
import { TimeSpan } from "oslo";

export async function authorizationCodeGrant(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: AuthorizationCodeGrantTypeParams,
) {
  const client = await ctx.env.data.clients.get(params.client_id);

  if (!client) {
    throw new HTTPException(403, { message: "Invalid client" });
  }

  const code = await ctx.env.data.codes.get(
    client.tenant.id,
    params.code,
    "authorization_code",
  );

  if (!code) {
    throw new HTTPException(403, { message: "Invalid code" });
  }

  const login = await ctx.env.data.logins.get(client.tenant.id, code.login_id);
  if (!login) {
    throw new HTTPException(403, { message: "Invalid login" });
  }

  if (client.client_secret !== params.client_secret) {
    throw new HTTPException(403, { message: "Invalid secret" });
  }

  const authParams: AuthParams = {
    client_id: client.id,
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
      sub: code.user_id,
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

  await ctx.env.data.codes.remove(client.tenant.id, params.code);

  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 86400,
  };
}
