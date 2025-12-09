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
import type { FC } from "hono/jsx";

export const displayName = "OAuth 2.0";

export const logo: FC<{ className?: string; iconUrl?: string }> = ({
  className = "",
  iconUrl,
}) => {
  if (iconUrl) {
    return <img src={iconUrl} alt="OAuth Provider" className={className} />;
  }

  // Default OAuth 2.0 logo (key icon)
  return (
    <svg
      width="45"
      height="45"
      viewBox="0 0 45 45"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M31.5 18h-1.5v-4.5c0-4.136-3.364-7.5-7.5-7.5s-7.5 3.364-7.5 7.5v4.5h-1.5c-1.657 0-3 1.343-3 3v15c0 1.657 1.343 3 3 3h18c1.657 0 3-1.343 3-3v-15c0-1.657-1.343-3-3-3zm-12-4.5c0-2.481 2.019-4.5 4.5-4.5s4.5 2.019 4.5 4.5v4.5h-9v-4.5zm12 22.5h-18v-15h18v15zm-9-6c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3z"
        fill="currentColor"
      />
    </svg>
  );
};

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
