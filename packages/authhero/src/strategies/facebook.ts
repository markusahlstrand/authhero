import { Facebook } from "arctic";
import { Context } from "hono";
import { Connection } from "@authhero/adapter-interfaces";
import { nanoid } from "nanoid";
import { Bindings, Variables } from "../types";

export async function getRedirect(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  connection: Connection,
) {
  const { options } = connection;

  if (!options?.client_id || !options.client_secret) {
    throw new Error("Missing required authentication parameters");
  }

  const facebook = new Facebook(
    options.client_id,
    options.client_secret,
    `${ctx.env.ISSUER}callback`,
  );

  const code = nanoid();

  const authorizationUrl = facebook.createAuthorizationURL(
    code,
    options.scope?.split(" ") || ["email"],
  );
  0;
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
    `${ctx.env.ISSUER}callback`,
  );

  const tokens = await facebook.validateAuthorizationCode(code);

  const userinfoResponse = await fetch(
    "https://graph.facebook.com/v16.0/me?fields=id,email,name",
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
