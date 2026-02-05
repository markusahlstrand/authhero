import { Facebook } from "arctic";
import { Context } from "hono";
import { Connection } from "@authhero/adapter-interfaces";
import { nanoid } from "nanoid";
import { Bindings, Variables } from "../types";
import { getAuthUrl } from "../variables";

export const displayName = "Facebook";

export const logoDataUri =
  "data:image/svg+xml,%3Csvg%20width%3D%2245%22%20height%3D%2245%22%20viewBox%3D%220%200%2045%2045%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M45%2022.5C45%2010.0736%2034.9264%200%2022.5%200C10.0736%200%200%2010.0736%200%2022.5C0%2033.7031%208.23242%2042.9785%2019.0039%2044.6953V28.9746H13.2861V22.5H19.0039V17.5391C19.0039%2011.8945%2022.3828%208.75977%2027.5391%208.75977C29.9658%208.75977%2032.5049%209.19922%2032.5049%209.19922V14.7656H29.7012C26.9414%2014.7656%2026.0156%2016.4824%2026.0156%2018.2432V22.5H32.2412L31.2012%2028.9746H26.0156V44.6953C36.7871%2042.9785%2045%2033.7031%2045%2022.5Z%22%20fill%3D%22%231877F2%22%2F%3E%3Cpath%20d%3D%22M31.2012%2028.9746L32.2412%2022.5H26.0156V18.2432C26.0156%2016.4824%2026.9414%2014.7656%2029.7012%2014.7656H32.5049V9.19922C32.5049%209.19922%2029.9658%208.75977%2027.5391%208.75977C22.3828%208.75977%2019.0039%2011.8945%2019.0039%2017.5391V22.5H13.2861V28.9746H19.0039V44.6953C20.1562%2044.8984%2021.3203%2045%2022.5%2045C23.6797%2045%2024.8438%2044.8984%2026.0156%2044.6953V28.9746H31.2012Z%22%20fill%3D%22white%22%2F%3E%3C%2Fsvg%3E";

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
