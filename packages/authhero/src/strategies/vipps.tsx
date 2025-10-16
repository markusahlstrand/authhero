import { OAuth2Client } from "arctic";
import { Context } from "hono";
import { Connection } from "@authhero/adapter-interfaces";
import { nanoid } from "nanoid";
import { Bindings, Variables } from "../types";
import { HTTPException } from "hono/http-exception";
import { parseJWT } from "oslo/jwt";
import { idTokenSchema } from "../types/IdToken";
import { getAuthUrl } from "../variables";
import type { FC } from "hono/jsx";

export const displayName = "Vipps";

export const logo: FC<{ className?: string }> = ({ className = "" }) => (
  <svg
    version="1.1"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 48 48"
    width="45"
    height="45"
    className={className}
  >
    <path
      fill="#FF5B24"
      d="M3.5,8h41c1.9,0,3.5,1.6,3.5,3.5v25c0,1.9-1.6,3.5-3.5,3.5h-41C1.6,40,0,38.4,0,36.5v-25C0,9.6,1.6,8,3.5,8z"
    />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      fill="#FFFFFF"
      d="M27.9,20.3c1.4,0,2.6-1,2.6-2.5h0c0-1.5-1.2-2.5-2.6-2.5c-1.4,0-2.6,1-2.6,2.5C25.3,19.2,26.5,20.3,27.9,20.3z
    M31.2,24.4c-1.7,2.2-3.5,3.8-6.7,3.8h0c-3.2,0-5.8-2-7.7-4.8c-0.8-1.2-2-1.4-2.9-0.8c-0.8,0.6-1,1.8-0.3,2.9
   c2.7,4.1,6.5,6.6,10.9,6.6c4,0,7.2-2,9.6-5.2c0.9-1.2,0.9-2.5,0-3.1C33.3,22.9,32.1,23.2,31.2,24.4z"
    />
  </svg>
);

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
    throw new HTTPException(400, { message: "Failed to get user from vipps" });
  }

  const userInfo = await userInfoResponse.json();

  return userInfo;
}
