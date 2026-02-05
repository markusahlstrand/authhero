import { generateCodeVerifier, Google } from "arctic";
import { Context } from "hono";
import { Connection } from "@authhero/adapter-interfaces";
import { nanoid } from "nanoid";
import { Bindings, Variables } from "../types";
import { parseJWT } from "oslo/jwt";
import { idTokenSchema } from "../types/IdToken";
import { getAuthUrl } from "../variables";

export const displayName = "Google";

export const disableEmbeddedBrowsers = true;

export const logoDataUri =
  "data:image/svg+xml,%3Csvg%20width%3D%2245%22%20height%3D%2245%22%20viewBox%3D%220%200%2045%2045%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M44.1035%2023.0123C44.1054%2021.4791%2043.9758%2019.9486%2043.716%2018.4375H22.498V27.1028H34.6507C34.4021%2028.4868%2033.8757%2029.8061%2033.1034%2030.9812C32.3311%2032.1562%2031.3289%2033.1628%2030.1571%2033.9401V39.5649H37.41C41.6567%2035.6494%2044.1035%2029.859%2044.1035%2023.0123Z%22%20fill%3D%22%234285F4%22%2F%3E%3Cpath%20d%3D%22M22.4982%2044.9997C28.5698%2044.9997%2033.6821%2043.0061%2037.4101%2039.5687L30.1573%2033.9439C28.1386%2035.3126%2025.5387%2036.0938%2022.4982%2036.0938C16.6296%2036.0938%2011.6485%2032.1377%209.86736%2026.8066H2.39575V32.6033C4.26839%2036.3297%207.13989%2039.4622%2010.6896%2041.6512C14.2394%2043.8402%2018.3277%2044.9995%2022.4982%2044.9997Z%22%20fill%3D%22%2334A853%22%2F%3E%3Cpath%20d%3D%22M9.86737%2026.8073C8.92572%2024.0138%208.92572%2020.9886%209.86737%2018.1951V12.3984H2.39576C0.820432%2015.5332%200%2018.9929%200%2022.5012C0%2026.0095%200.820432%2029.4692%202.39576%2032.604L9.86737%2026.8073Z%22%20fill%3D%22%23FBBC04%22%2F%3E%3Cpath%20d%3D%22M22.4982%208.90741C25.7068%208.85499%2028.8071%2010.0673%2031.1291%2012.2823L37.5507%205.86064C33.4788%202.03602%2028.0843%20-0.0637686%2022.4982%200.00147616C18.3277%200.00166623%2014.2394%201.16098%2010.6896%203.34999C7.13989%205.539%204.26839%208.67155%202.39575%2012.3979L9.86736%2018.1946C11.6485%2012.8635%2016.6296%208.90741%2022.4982%208.90741Z%22%20fill%3D%22%23EA4335%22%2F%3E%3C%2Fsvg%3E";

export async function getRedirect(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  connection: Connection,
) {
  const { options } = connection;

  if (!options?.client_id || !options.client_secret) {
    throw new Error("Missing required Google authentication parameters");
  }

  const callbackUrl = `${getAuthUrl(ctx.env)}callback`;

  const google = new Google(
    options.client_id,
    options.client_secret,
    callbackUrl,
  );

  const code = nanoid();
  const code_verifier = generateCodeVerifier();

  const authorizationUrl = google.createAuthorizationURL(
    code,
    code_verifier,
    options.scope?.split(" ") ?? ["email", "profile"],
  );

  return {
    redirectUrl: authorizationUrl.href,
    code,
    codeVerifier: code_verifier,
  };
}

export async function validateAuthorizationCodeAndGetUser(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  connection: Connection,
  code: string,
  code_verifier?: string,
) {
  const { options } = connection;

  if (!options?.client_id || !options.client_secret || !code_verifier) {
    throw new Error("Missing required authentication parameters");
  }

  const google = new Google(
    options.client_id,
    options.client_secret,
    `${getAuthUrl(ctx.env)}callback`,
  );

  const tokens = await google.validateAuthorizationCode(code, code_verifier);

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
