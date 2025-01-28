import { OAuth2Client } from "arctic";
import { Context } from "hono";
import { Connection } from "@authhero/adapter-interfaces";
import { nanoid } from "nanoid";
import { Bindings, Variables } from "../types";
import { HTTPException } from "hono/http-exception";
import { parseJWT } from "oslo/jwt";
import { idTokenSchema } from "../types/IdToken";

export async function getRedirect(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  connection: Connection,
) {
  const { options } = connection;

  if (!options?.client_id || !options.client_secret) {
    throw new Error("Missing required authentication parameters");
  }

  const client = new OAuth2Client(
    options.client_id,
    options.client_secret,
    `${ctx.env.ISSUER}callback`,
  );

  const code = nanoid();

  const authorizationUrl = client.createAuthorizationURL(
    "https://api.vipps.no/access-management-1.0/access/oauth2/auth",
    code,
    options.scope?.split(" ") || [
      "openid",
      "email",
      "phoneNumber",
      "name",
      "address",
      "birthDate",
    ],
  );
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("response_mode", "query");

  return {
    redirectUrl: authorizationUrl.href,
    code,
  };
}

export async function validateAuthorizationCodeAndGetUser(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  connection: Connection,
  code: string,
) {
  const { options } = connection;

  if (!options?.client_id || !options.client_secret) {
    throw new Error("Missing required authentication parameters");
  }

  const client = new OAuth2Client(
    options.client_id,
    options.client_secret,
    `${ctx.env.ISSUER}callback`,
  );

  const tokens = await client.validateAuthorizationCode(
    "https://api.vipps.no/access-management-1.0/access/oauth2/token",
    code,
    null,
  );

  const idToken = parseJWT(tokens.idToken());

  if (!idToken) {
    throw new Error("Invalid ID token");
  }

  const payload = idTokenSchema.parse(idToken.payload);

  if (typeof payload.msn !== "string") {
    throw new Error("msn not available in id token");
  }

  const userInfoResponse = await fetch(
    `https://api.vipps.no/vipps-userinfo-api/userinfo`,
    {
      headers: {
        Authorization: `Bearer ${tokens.accessToken()}`,
        "Merchant-Serial-Number": payload.msn,
      },
    },
  );

  if (!userInfoResponse.ok) {
    throw new HTTPException(400, { message: "Failed to get user from vipps" });
  }

  const userInfo = await userInfoResponse.json();

  return userInfo;
}
