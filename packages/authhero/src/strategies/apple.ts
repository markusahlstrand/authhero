import { Apple } from "arctic";
import { Context } from "hono";
import { Connection } from "@authhero/adapter-interfaces";
import { nanoid } from "nanoid";
import { Bindings, Variables } from "../types";
import { parseJWT } from "oslo/jwt";
import { idTokenSchema } from "../types/IdToken";

function getAppleOptions(connection: Connection) {
  const { options } = connection;

  if (
    !options ||
    !options.client_id ||
    !options.team_id ||
    !options.kid ||
    !options.app_secret
  ) {
    throw new Error("Missing required Apple authentication parameters");
  }

  // Use a secure buffer to handle private key
  const privateKeyBuffer = Buffer.from(options.app_secret, "utf-8");
  const cleanedKey = privateKeyBuffer
    .toString()
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const keyArray = Uint8Array.from(Buffer.from(cleanedKey, "base64"));
  // Clear sensitive data from memory
  privateKeyBuffer.fill(0);

  return { options, keyArray };
}

export async function getRedirect(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  connection: Connection,
) {
  const { options, keyArray } = getAppleOptions(connection);

  const apple = new Apple(
    options.client_id!,
    options.team_id!,
    options.kid!,
    keyArray,
    `${ctx.env.ISSUER}callback`,
  );

  const code = nanoid();

  const authorizationUrl = await apple.createAuthorizationURL(
    code,
    options.scope?.split(" ") || ["name", "email"],
  );

  const scopes = options.scope?.split(" ") || ["name", "email"];
  if (scopes.some((scope) => ["email", "name"].includes(scope))) {
    authorizationUrl.searchParams.set("response_mode", "form_post");
  }

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
  const { options, keyArray } = getAppleOptions(connection);

  const apple = new Apple(
    options.client_id!,
    options.team_id!,
    options.kid!,
    keyArray,
    `${ctx.env.ISSUER}callback`,
  );

  const tokens = await apple.validateAuthorizationCode(code);
  const idToken = parseJWT(tokens.idToken());

  if (!idToken) {
    throw new Error("Invalid ID token");
  }

  const payload = idTokenSchema.parse(idToken.payload);

  return {
    sub: payload.sub,
    email: payload.email,
    given_name: payload.given_name,
    family_name: payload.family_name,
    name: payload.name,
    picture: payload.picture,
    locale: payload.locale,
  };
}
