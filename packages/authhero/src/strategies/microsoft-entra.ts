import { generateCodeVerifier, MicrosoftEntraId } from "arctic";
import { Context } from "hono";
import { Connection } from "@authhero/adapter-interfaces";
import { nanoid } from "nanoid";
import { Bindings, Variables } from "../types";
import { parseJWT } from "oslo/jwt";
import { idTokenSchema } from "../types/IdToken";
import { getConnectionCallbackUrl } from "./index";

// Shared Microsoft Identity Platform v2.0 client used by both the
// `windowslive` (Microsoft Account) and `waad` (Azure AD) strategies.
// The tenant segment is what differentiates them at the OAuth layer:
// `consumers` for personal accounts, a tenant GUID / `organizations`
// for enterprise.
function createClient(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  connection: Connection,
  defaultTenant: string,
) {
  const { options } = connection;
  if (!options?.client_id || !options.client_secret) {
    throw new Error("Missing required Microsoft authentication parameters");
  }
  const tenant = options.realms || defaultTenant;
  return new MicrosoftEntraId(
    tenant,
    options.client_id,
    options.client_secret,
    getConnectionCallbackUrl(ctx, connection),
  );
}

export async function microsoftEntraRedirect(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  connection: Connection,
  loginHint: string | undefined,
  defaultTenant: string,
) {
  const client = createClient(ctx, connection, defaultTenant);

  const code = nanoid();
  const code_verifier = generateCodeVerifier();

  const authorizationUrl = client.createAuthorizationURL(
    code,
    code_verifier,
    connection.options?.scope?.split(" ") || ["openid", "profile", "email"],
  );

  if (loginHint) {
    authorizationUrl.searchParams.set("login_hint", loginHint);
  }

  return {
    redirectUrl: authorizationUrl.href,
    code,
    codeVerifier: code_verifier,
  };
}

export async function microsoftEntraValidate(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  connection: Connection,
  code: string,
  code_verifier: string | undefined,
  defaultTenant: string,
) {
  if (!code_verifier) {
    throw new Error("Missing required authentication parameters");
  }

  const client = createClient(ctx, connection, defaultTenant);
  const tokens = await client.validateAuthorizationCode(code, code_verifier);

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

export const microsoftLogoDataUri =
  "data:image/svg+xml,%3Csvg%20width%3D%2245%22%20height%3D%2245%22%20viewBox%3D%220%200%2045%2045%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20fill%3D%22%23F25022%22%20d%3D%22M0%200H21.43V21.43H0V0Z%22%2F%3E%3Cpath%20fill%3D%22%237FBA00%22%20d%3D%22M23.57%200H45V21.43H23.57V0Z%22%2F%3E%3Cpath%20fill%3D%22%2300A4EF%22%20d%3D%22M0%2023.57H21.43V45H0V23.57Z%22%2F%3E%3Cpath%20fill%3D%22%23FFB900%22%20d%3D%22M23.57%2023.57H45V45H23.57V23.57Z%22%2F%3E%3C%2Fsvg%3E";
