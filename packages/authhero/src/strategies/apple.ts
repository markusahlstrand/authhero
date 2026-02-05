import { Apple } from "arctic";
import { Context } from "hono";
import { Connection } from "@authhero/adapter-interfaces";
import { nanoid } from "nanoid";
import { Bindings, Variables } from "../types";
import { parseJWT } from "oslo/jwt";
import { idTokenSchema } from "../types/IdToken";
import { getAuthUrl } from "../variables";

export const displayName = "Apple";

export const logoDataUri =
  "data:image/svg+xml,%3Csvg%20width%3D%2245%22%20height%3D%2245%22%20viewBox%3D%220%200%2045%2045%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M45%200H0V45H45V0Z%22%20fill%3D%22white%22%2F%3E%3Cpath%20d%3D%22M23.5344%2010.3846C25.5313%2010.3846%2028.0344%209.01144%2029.525%207.18055C30.875%205.5213%2031.8594%203.20407%2031.8594%200.886839C31.8594%200.572154%2031.8313%200.25747%2031.775%200C29.5531%200.0858233%2026.8813%201.51621%2025.2781%203.43293C24.0125%204.89193%2022.8594%207.18055%2022.8594%209.52638C22.8594%209.86968%2022.9156%2010.213%2022.9438%2010.3274C23.0844%2010.356%2023.3094%2010.3846%2023.5344%2010.3846ZM16.5031%2045C19.2313%2045%2020.4406%2043.1405%2023.8438%2043.1405C27.3031%2043.1405%2028.0625%2044.9428%2031.1%2044.9428C34.0813%2044.9428%2036.0781%2042.1392%2037.9625%2039.3929C40.0719%2036.246%2040.9438%2033.1564%2041%2033.0134C40.8031%2032.9561%2035.0938%2030.5817%2035.0938%2023.9161C35.0938%2018.1373%2039.5938%2015.534%2039.8469%2015.3338C36.8656%2010.9854%2032.3375%2010.8709%2031.1%2010.8709C27.7531%2010.8709%2025.025%2012.9307%2023.3094%2012.9307C21.4531%2012.9307%2019.0063%2010.9854%2016.1094%2010.9854C10.5969%2010.9854%205%2015.6198%205%2024.3738C5%2029.8093%207.08125%2035.5594%209.64063%2039.2784C11.8344%2042.4253%2013.7469%2045%2016.5031%2045Z%22%20fill%3D%22black%22%2F%3E%3C%2Fsvg%3E";

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
