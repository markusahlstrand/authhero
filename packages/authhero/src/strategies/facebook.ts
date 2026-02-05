import { Facebook } from "arctic";
import { Context } from "hono";
import { Connection } from "@authhero/adapter-interfaces";
import { nanoid } from "nanoid";
import { Bindings, Variables } from "../types";
import { getAuthUrl } from "../variables";
import { svgToDataUri } from "../utils/svgToDataUri";

export const displayName = "Facebook";

export const logoSvg = `<svg width="45" height="45" viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg"><path d="M45 22.5C45 10.0736 34.9264 0 22.5 0C10.0736 0 0 10.0736 0 22.5C0 33.7031 8.23242 42.9785 19.0039 44.6953V28.9746H13.2861V22.5H19.0039V17.5391C19.0039 11.8945 22.3828 8.75977 27.5391 8.75977C29.9658 8.75977 32.5049 9.19922 32.5049 9.19922V14.7656H29.7012C26.9414 14.7656 26.0156 16.4824 26.0156 18.2432V22.5H32.2412L31.2012 28.9746H26.0156V44.6953C36.7871 42.9785 45 33.7031 45 22.5Z" fill="#1877F2"/><path d="M31.2012 28.9746L32.2412 22.5H26.0156V18.2432C26.0156 16.4824 26.9414 14.7656 29.7012 14.7656H32.5049V9.19922C32.5049 9.19922 29.9658 8.75977 27.5391 8.75977C22.3828 8.75977 19.0039 11.8945 19.0039 17.5391V22.5H13.2861V28.9746H19.0039V44.6953C20.1562 44.8984 21.3203 45 22.5 45C23.6797 45 24.8438 44.8984 26.0156 44.6953V28.9746H31.2012Z" fill="white"/></svg>`;

export const logoDataUri = svgToDataUri(logoSvg);

export async function getRedirect(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  connection: Connection,
) {
  const { options } = connection;

  if (!options?.client_id || !options.client_secret) {
    throw new Error("Missing required authentication parameters");
  }

  const callbackUrl = `${getAuthUrl(ctx.env)}callback`;

  const facebook = new Facebook(
    options.client_id,
    options.client_secret,
    callbackUrl,
  );

  const code = nanoid();

  const authorizationUrl = facebook.createAuthorizationURL(
    code,
    options.scope?.split(" ") || ["email"],
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

  const facebook = new Facebook(
    options.client_id,
    options.client_secret,
    `${getAuthUrl(ctx.env)}callback`,
  );

  const tokens = await facebook.validateAuthorizationCode(code);

  const userinfoResponse = await fetch(
    "https://graph.facebook.com/v22.0/me?fields=id,email,name",
    {
      headers: {
        Authorization: `Bearer ${tokens.accessToken()}`,
      },
    },
  );

  if (!userinfoResponse.ok) {
    throw new Error("Failed to fetch user info");
  }

  const userInfo = await userinfoResponse.json();
  ctx.set("log", `Userinfo: ${JSON.stringify(userInfo)}`);

  return {
    sub: userInfo.id,
    email: userInfo.email,
    name: userInfo.name,
  };
}
