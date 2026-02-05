import {
  OAuth2Client,
  generateState,
  generateCodeVerifier,
  CodeChallengeMethod,
} from "arctic";
import { Context } from "hono";
import { Connection } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import { getAuthUrl } from "../variables";
import { svgToDataUri } from "../utils/svgToDataUri";

export const displayName = "OAuth 2.0";

export const logoSvg = `<svg width="45" height="45" viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg"><path d="M22.5 0C14.492 0 8 6.492 8 14.5V18H5v22h35V18h-3v-3.5C37 6.492 30.508 0 22.5 0zm0 4c5.799 0 10.5 4.701 10.5 10.5V18h-21v-3.5C12 8.701 16.701 4 22.5 4z" fill="#6B7280"/><circle cx="22.5" cy="29" r="3" fill="#6B7280"/></svg>`;

export const logoDataUri = svgToDataUri(logoSvg);

export async function getRedirect(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  connection: Connection,
) {
  const { options } = connection;

  if (!options?.client_id || !options.authorization_endpoint) {
    throw new Error("Missing required OAuth2 authentication parameters");
  }

  const callbackUrl = `${getAuthUrl(ctx.env)}callback`;

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

  return {
    redirectUrl: authorizationUrl.href,
    code: state,
    codeVerifier,
  };
}

export async function validateAuthorizationCodeAndGetUser(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  connection: Connection,
  code: string,
  codeVerifier?: string,
) {
  const { options } = connection;

  if (!options?.client_id || !options.token_endpoint) {
    throw new Error("Missing required authentication parameters");
  }

  const callbackUrl = `${getAuthUrl(ctx.env)}callback`;

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

  const user = await userResponse.json();

  // OAuth2 responses can vary, try to extract common fields
  const sub = user.sub || user.id || user.user_id;
  if (!sub) {
    throw new Error(
      "Unable to get user identifier: response missing sub, id, or user_id",
    );
  }

  return {
    sub,
    email: user.email,
    given_name: user.given_name || user.first_name,
    family_name: user.family_name || user.last_name,
    name:
      user.name ||
      `${user.given_name || user.first_name || ""} ${user.family_name || user.last_name || ""}`.trim(),
  };
}
