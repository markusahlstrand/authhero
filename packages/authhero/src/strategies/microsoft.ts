import { generateCodeVerifier, MicrosoftEntraId } from "arctic";
import { Context } from "hono";
import { Connection } from "@authhero/adapter-interfaces";
import { nanoid } from "nanoid";
import { Bindings, Variables } from "../types";
import { parseJWT } from "oslo/jwt";
import { idTokenSchema } from "../types/IdToken";
import { getAuthUrl } from "../variables";

export const displayName = "Microsoft";

export const logoDataUri =
  "data:image/svg+xml,%3Csvg%20width%3D%2245%22%20height%3D%2245%22%20viewBox%3D%220%200%2045%2045%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20fill%3D%22%23F25022%22%20d%3D%22M0%200H21.43V21.43H0V0Z%22%2F%3E%3Cpath%20fill%3D%22%237FBA00%22%20d%3D%22M23.57%200H45V21.43H23.57V0Z%22%2F%3E%3Cpath%20fill%3D%22%2300A4EF%22%20d%3D%22M0%2023.57H21.43V45H0V23.57Z%22%2F%3E%3Cpath%20fill%3D%22%23FFB900%22%20d%3D%22M23.57%2023.57H45V45H23.57V23.57Z%22%2F%3E%3C%2Fsvg%3E";

export async function getRedirect(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  connection: Connection,
) {
  const { options } = connection;

  if (!options?.client_id || !options.client_secret) {
    throw new Error("Missing required Microsoft authentication parameters");
  }

  const callbackUrl = `${getAuthUrl(ctx.env)}callback`;

  // tenant can be 'common', 'organizations', 'consumers', or a specific tenant ID
  const tenant = options.realms || "common";

  const microsoft = new MicrosoftEntraId(
    tenant,
    options.client_id,
    options.client_secret,
    callbackUrl,
  );

  const code = nanoid();
  const code_verifier = generateCodeVerifier();

  const authorizationUrl = microsoft.createAuthorizationURL(
    code,
    code_verifier,
    options.scope?.split(" ") || ["openid", "profile", "email"],
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

  const tenant = options.realms || "common";

  const microsoft = new MicrosoftEntraId(
    tenant,
    options.client_id,
    options.client_secret,
    `${getAuthUrl(ctx.env)}callback`,
  );

  const tokens = await microsoft.validateAuthorizationCode(code, code_verifier);

  const idToken = parseJWT(tokens.idToken());

  if (!idToken) {
    throw new Error("Invalid ID token");
  }

  const payload = idTokenSchema.parse(idToken.payload);

  ctx.set("log", `Microsoft user: ${JSON.stringify(payload)}`);

  return {
    sub: payload.sub,
    email: payload.email,
    given_name: payload.given_name,
    family_name: payload.family_name,
    name: payload.name,
    picture: payload.picture,
  };
}
