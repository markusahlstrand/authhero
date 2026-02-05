import {
  OAuth2Client,
  generateState,
  generateCodeVerifier,
  CodeChallengeMethod,
} from "arctic";
import { Context } from "hono";
import { Connection } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import { parseJWT } from "oslo/jwt";
import { idTokenSchema } from "../types/IdToken";
import { getAuthUrl } from "../variables";

export const displayName = "OpenID Connect";

export const logoDataUri =
  "data:image/svg+xml,%3Csvg%20width%3D%2245%22%20height%3D%2245%22%20viewBox%3D%220%200%2045%2045%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M22.5%200C10.074%200%200%2010.074%200%2022.5S10.074%2045%2022.5%2045%2045%2034.926%2045%2022.5%2034.926%200%2022.5%200zm0%2040.5c-9.941%200-18-8.059-18-18s8.059-18%2018-18%2018%208.059%2018%2018-8.059%2018-18%2018z%22%20fill%3D%22%23F7931E%22%2F%3E%3Cpath%20d%3D%22M22.5%209c-7.456%200-13.5%206.044-13.5%2013.5S15.044%2036%2022.5%2036%2036%2029.956%2036%2022.5%2029.956%209%2022.5%209zm0%2022.5c-4.971%200-9-4.029-9-9s4.029-9%209-9%209%204.029%209%209-4.029%209-9%209z%22%20fill%3D%22%23F7931E%22%2F%3E%3C%2Fsvg%3E";

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
    const idToken = parseJWT(tokens.idToken());
    if (idToken?.payload) {
      const payload = idTokenSchema.passthrough().parse(idToken.payload);
      return {
        sub: payload.sub,
        email: payload.email,
        given_name: payload.given_name,
        family_name: payload.family_name,
        name: payload.name,
      };
    }
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
