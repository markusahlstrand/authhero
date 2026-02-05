import { Apple } from "arctic";
import { Context } from "hono";
import { Connection } from "@authhero/adapter-interfaces";
import { nanoid } from "nanoid";
import { Bindings, Variables } from "../types";
import { parseJWT } from "oslo/jwt";
import { idTokenSchema } from "../types/IdToken";
import { getAuthUrl } from "../variables";
import { svgToDataUri } from "../utils/svgToDataUri";

export const displayName = "Apple";

export const logoSvg = `<svg width="45" height="45" viewBox="0 0 45 45" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M45 0H0V45H45V0Z" fill="white"/><path d="M23.5344 10.3846C25.5313 10.3846 28.0344 9.01144 29.525 7.18055C30.875 5.5213 31.8594 3.20407 31.8594 0.886839C31.8594 0.572154 31.8313 0.25747 31.775 0C29.5531 0.0858233 26.8813 1.51621 25.2781 3.43293C24.0125 4.89193 22.8594 7.18055 22.8594 9.52638C22.8594 9.86968 22.9156 10.213 22.9438 10.3274C23.0844 10.356 23.3094 10.3846 23.5344 10.3846ZM16.5031 45C19.2313 45 20.4406 43.1405 23.8438 43.1405C27.3031 43.1405 28.0625 44.9428 31.1 44.9428C34.0813 44.9428 36.0781 42.1392 37.9625 39.3929C40.0719 36.246 40.9438 33.1564 41 33.0134C40.8031 32.9561 35.0938 30.5817 35.0938 23.9161C35.0938 18.1373 39.5938 15.534 39.8469 15.3338C36.8656 10.9854 32.3375 10.8709 31.1 10.8709C27.7531 10.8709 25.025 12.9307 23.3094 12.9307C21.4531 12.9307 19.0063 10.9854 16.1094 10.9854C10.5969 10.9854 5 15.6198 5 24.3738C5 29.8093 7.08125 35.5594 9.64063 39.2784C11.8344 42.4253 13.7469 45 16.5031 45Z" fill="black"/></svg>`;

export const logoDataUri = svgToDataUri(logoSvg);

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

  const callbackUrl = `${getAuthUrl(ctx.env)}callback`;

  const apple = new Apple(
    options.client_id!,
    options.team_id!,
    options.kid!,
    keyArray,
    callbackUrl,
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
    `${getAuthUrl(ctx.env)}callback`,
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
