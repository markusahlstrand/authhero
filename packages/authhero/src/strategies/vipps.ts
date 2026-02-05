import { OAuth2Client } from "arctic";
import { Context } from "hono";
import { Connection } from "@authhero/adapter-interfaces";
import { nanoid } from "nanoid";
import { Bindings, Variables } from "../types";
import { JSONHTTPException } from "../errors/json-http-exception";
import { parseJWT } from "oslo/jwt";
import { idTokenSchema } from "../types/IdToken";
import { getAuthUrl } from "../variables";

export const displayName = "Vipps";

export const logoDataUri =
  "data:image/svg+xml,%3Csvg%20version%3D%221.1%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2048%2048%22%20width%3D%2245%22%20height%3D%2245%22%3E%3Cpath%20fill%3D%22%23FF5B24%22%20d%3D%22M3.5%2C8h41c1.9%2C0%2C3.5%2C1.6%2C3.5%2C3.5v25c0%2C1.9-1.6%2C3.5-3.5%2C3.5h-41C1.6%2C40%2C0%2C38.4%2C0%2C36.5v-25C0%2C9.6%2C1.6%2C8%2C3.5%2C8z%22%2F%3E%3Cpath%20fill-rule%3D%22evenodd%22%20clip-rule%3D%22evenodd%22%20fill%3D%22%23FFFFFF%22%20d%3D%22M27.9%2C20.3c1.4%2C0%2C2.6-1%2C2.6-2.5h0c0-1.5-1.2-2.5-2.6-2.5c-1.4%2C0-2.6%2C1-2.6%2C2.5C25.3%2C19.2%2C26.5%2C20.3%2C27.9%2C20.3z%20M31.2%2C24.4c-1.7%2C2.2-3.5%2C3.8-6.7%2C3.8h0c-3.2%2C0-5.8-2-7.7-4.8c-0.8-1.2-2-1.4-2.9-0.8c-0.8%2C0.6-1%2C1.8-0.3%2C2.9%20c2.7%2C4.1%2C6.5%2C6.6%2C10.9%2C6.6c4%2C0%2C7.2-2%2C9.6-5.2c0.9-1.2%2C0.9-2.5%2C0-3.1C33.3%2C22.9%2C32.1%2C23.2%2C31.2%2C24.4z%22%2F%3E%3C%2Fsvg%3E";

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
    `${getAuthUrl(ctx.env)}callback`,
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
    `${getAuthUrl(ctx.env)}callback`,
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
    throw new JSONHTTPException(400, {
      message: "Failed to get user from vipps",
    });
  }

  const userInfo = await userInfoResponse.json();

  return userInfo;
}
