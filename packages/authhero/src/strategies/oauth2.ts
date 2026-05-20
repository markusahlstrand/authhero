import {
  OAuth2Client,
  generateState,
  generateCodeVerifier,
  CodeChallengeMethod,
} from "arctic";
import { Context } from "hono";
import { Connection } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import { getConnectionCallbackUrl } from "./index";

export const displayName = "OAuth 2.0";

export const logoDataUri =
  "data:image/svg+xml,%3Csvg%20width%3D%2245%22%20height%3D%2245%22%20viewBox%3D%220%200%2045%2045%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M22.5%200C14.492%200%208%206.492%208%2014.5V18H5v22h35V18h-3v-3.5C37%206.492%2030.508%200%2022.5%200zm0%204c5.799%200%2010.5%204.701%2010.5%2010.5V18h-21v-3.5C12%208.701%2016.701%204%2022.5%204z%22%20fill%3D%22%236B7280%22%2F%3E%3Ccircle%20cx%3D%2222.5%22%20cy%3D%2229%22%20r%3D%223%22%20fill%3D%22%236B7280%22%2F%3E%3C%2Fsvg%3E";

export async function getRedirect(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  connection: Connection,
  loginHint?: string,
) {
  const { options } = connection;

  if (!options?.client_id || !options.authorization_endpoint) {
    throw new Error("Missing required OAuth2 authentication parameters");
  }

  const callbackUrl = getConnectionCallbackUrl(ctx, connection);

  const client = new OAuth2Client(
    options.client_id,
    options.client_secret || null,
    callbackUrl,
  );

  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const scopes = options.scope?.split(" ") ?? [];

  const authorizationUrl = client.createAuthorizationURLWithPKCE(
    options.authorization_endpoint,
    state,
    CodeChallengeMethod.S256,
    codeVerifier,
    scopes,
  );

  if (loginHint) {
    authorizationUrl.searchParams.set("login_hint", loginHint);
  }

  return {
    redirectUrl: authorizationUrl.href,
    code: state,
    codeVerifier,
  };
}

async function validateAuthorizationCodeAndGetUserInternal(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  connection: Connection,
  code: string,
  codeVerifier?: string,
): Promise<{
  userinfo: {
    sub: string;
    email?: string;
    given_name?: string;
    family_name?: string;
    name?: string;
  };
  raw: Record<string, unknown> | null;
}> {
  const { options } = connection;

  if (!options?.client_id || !options.token_endpoint) {
    throw new Error("Missing required authentication parameters");
  }

  const callbackUrl = getConnectionCallbackUrl(ctx, connection);

  const client = new OAuth2Client(
    options.client_id,
    options.client_secret || null,
    callbackUrl,
  );

  const tokens = await client.validateAuthorizationCode(
    options.token_endpoint,
    code,
    codeVerifier || null,
  );

  // OAuth2 requires a userinfo endpoint to get user information
  if (!options.userinfo_endpoint) {
    throw new Error("Missing userinfo_endpoint for OAuth2 provider");
  }

  const userResponse = await fetch(options.userinfo_endpoint, {
    headers: {
      Authorization: `Bearer ${tokens.accessToken()}`,
    },
  });

  if (!userResponse.ok) {
    throw new Error("Failed to fetch user info");
  }

  const user = (await userResponse.json()) as Record<string, unknown>;

  // OAuth2 responses can vary, try to extract common fields
  const subVal = user.sub ?? user.id ?? user.user_id;
  if (typeof subVal !== "string" && typeof subVal !== "number") {
    throw new Error(
      "Unable to get user identifier: response missing sub, id, or user_id",
    );
  }
  const sub = String(subVal);

  const givenName =
    (typeof user.given_name === "string" ? user.given_name : undefined) ||
    (typeof user.first_name === "string" ? user.first_name : undefined);
  const familyName =
    (typeof user.family_name === "string" ? user.family_name : undefined) ||
    (typeof user.last_name === "string" ? user.last_name : undefined);

  return {
    userinfo: {
      sub,
      email: typeof user.email === "string" ? user.email : undefined,
      given_name: givenName,
      family_name: familyName,
      name:
        typeof user.name === "string"
          ? user.name
          : `${givenName || ""} ${familyName || ""}`.trim() || undefined,
    },
    raw: user,
  };
}

export async function validateAuthorizationCodeAndGetUser(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  connection: Connection,
  code: string,
  codeVerifier?: string,
) {
  const { userinfo } = await validateAuthorizationCodeAndGetUserInternal(
    ctx,
    connection,
    code,
    codeVerifier,
  );
  return userinfo;
}

export const validateAuthorizationCodeAndGetUserWithRaw =
  validateAuthorizationCodeAndGetUserInternal;
