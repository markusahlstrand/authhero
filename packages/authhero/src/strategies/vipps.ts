import { OAuth2Client } from "arctic";
import { Context } from "hono";
import { Connection } from "@authhero/adapter-interfaces";
import { nanoid } from "nanoid";
import { Bindings, Variables } from "../types";
import { userInfoSchema } from "../types/IdToken";

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

  const response = await fetch(
    "https://api.vipps.no/vipps-userinfo-api/userinfo",
    {
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
      },
    },
  );

  const userInfo = userInfoSchema.parse(await response.json());

  return {
    sub: userInfo.sub,
    email: userInfo.email,
    given_name: userInfo.given_name,
    family_name: userInfo.family_name,
    name: userInfo.name,
    picture: userInfo.picture,
    locale: userInfo.locale,
  };
}
