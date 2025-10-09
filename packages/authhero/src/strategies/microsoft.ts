import { generateCodeVerifier, MicrosoftEntraId } from "arctic";
import { Context } from "hono";
import { Connection } from "@authhero/adapter-interfaces";
import { nanoid } from "nanoid";
import { Bindings, Variables } from "../types";
import { parseJWT } from "oslo/jwt";
import { idTokenSchema } from "../types/IdToken";
import { getAuthUrl } from "../variables";
import { MicrosoftLogo } from "./social-strategies";

export const displayName = "Microsoft";
export const logo = MicrosoftLogo;

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
