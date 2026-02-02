import {
  OAuth2Client,
  generateState,
  generateCodeVerifier,
  CodeChallengeMethod,
} from "arctic";
import { Context } from "hono";
import { Connection } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import { decodeJwt } from "jose";
import { idTokenSchema } from "../types/IdToken";
import { getAuthUrl } from "../variables";
import type { FC } from "hono/jsx";

export const displayName = "OpenID Connect";

export const logo: FC<{ className?: string; iconUrl?: string }> = ({
  className = "",
  iconUrl,
}) => {
  if (iconUrl) {
    return <img src={iconUrl} alt="OIDC Provider" className={className} />;
  }

  // Default OpenID Connect logo
  return (
    <svg
      width="45"
      height="45"
      viewBox="0 0 45 45"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M22.5 0C10.074 0 0 10.074 0 22.5S10.074 45 22.5 45 45 34.926 45 22.5 34.926 0 22.5 0zm0 40.5c-9.941 0-18-8.059-18-18s8.059-18 18-18 18 8.059 18 18-8.059 18-18 18z"
        fill="currentColor"
      />
      <path
        d="M22.5 9c-7.456 0-13.5 6.044-13.5 13.5S15.044 36 22.5 36 36 29.956 36 22.5 29.956 9 22.5 9zm0 22.5c-4.971 0-9-4.029-9-9s4.029-9 9-9 9 4.029 9 9-4.029 9-9 9z"
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
    throw new Error("Missing required OIDC authentication parameters");
  }

  const callbackUrl = `${getAuthUrl(ctx.env)}callback`;

  const client = new OAuth2Client(
    options.client_id,
    options.client_secret || null,
    callbackUrl,
  );

  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const scopes = options.scope?.split(" ") ?? ["openid", "profile", "email"];

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

  // Try to get user info from ID token first
  // Check if id_token exists before calling idToken() which throws if missing
  const tokenData = tokens.data as { id_token?: string };
  if (tokenData.id_token) {
    const idTokenPayload = decodeJwt(tokens.idToken());
    const payload = idTokenSchema.passthrough().parse(idTokenPayload);
    return {
      sub: payload.sub,
      email: payload.email,
      given_name: payload.given_name,
      family_name: payload.family_name,
      name: payload.name,
    };
  }

  // Fall back to userinfo endpoint if available
  if (options.userinfo_endpoint) {
    const userResponse = await fetch(options.userinfo_endpoint, {
      headers: {
        Authorization: `Bearer ${tokens.accessToken()}`,
      },
    });

    if (!userResponse.ok) {
      throw new Error("Failed to fetch user info");
    }

    const user = await userResponse.json();

    if (!user.sub) {
      throw new Error(
        "Unable to get user identifier: userinfo response missing sub",
      );
    }

    return {
      sub: user.sub,
      email: user.email,
      given_name: user.given_name,
      family_name: user.family_name,
      name: user.name,
    };
  }

  throw new Error(
    "Unable to get user information: no ID token or userinfo endpoint",
  );
}
