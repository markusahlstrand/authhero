import { Context } from "hono";
import {
  AuthorizationResponseType,
  Client,
  CodeChallengeMethod,
  LogTypes,
  Session,
} from "@authhero/adapter-interfaces";
import { createLogMessage } from "../utils/create-log-message";
import { Bindings, Variables } from "../types";
import { serializeAuthCookie } from "../utils/cookies";
import renderAuthIframe from "../utils/authIframe";
import { createAuthTokens } from "./common";

interface SilentAuthParams {
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>;
  client: Client;
  session?: Session;
  redirect_uri: string;
  state: string;
  response_type: AuthorizationResponseType;
  nonce?: string;
  code_challenge_method?: CodeChallengeMethod;
  code_challenge?: string;
  audience?: string;
  scope?: string;
}

/**
 * Handles silent authentication for a user.
 *
 * This function performs silent authentication by verifying the existence of a session, updating the user context
 * and authentication cookies, retrieving user details from the datastore, and generating authentication tokens.
 * On success, it updates the session's usage timestamp, logs the successful authentication, and returns an HTML
 * response containing an iframe with the token response. If no valid session or user is found, it logs the failure
 * and returns an error response indicating that login is required.
 *
 * @param ctx - The context object that includes environment bindings and methods to manage request state.
 * @param client - The client configuration object, including tenant and client identifiers.
 * @param session - An optional session object containing user session data. When provided, it must contain a `user_id`
 *                and an `id` property, where `id` is used for cookie serialization and session updates.
 * @param redirect_uri - The URI to be used for redirection after authentication, which is employed to build the iframe URL.
 * @param state - A parameter used to maintain state between the authentication request and callback.
 * @param nonce - An optional nonce value for additional security during the authentication process.
 * @param code_challenge_method - An optional method name for the code challenge used in PKCE flows.
 * @param code_challenge - An optional code challenge string for PKCE flows.
 * @param audience - An optional parameter specifying the intended audience of the authentication tokens.
 * @param scope - An optional parameter indicating the scope of the authentication request.
 *
 * @returns A promise resolving to an HTML response. The response contains an iframe that encapsulates either the generated
 *          authentication tokens on success or an error object (with a "login_required" message) on failure.
 *
 * @remarks
 * When a valid session and corresponding user are found, the function generates tokens with a response type of TOKEN_ID_TOKEN,
 * updates the session's "used_at" timestamp, and logs a successful silent authentication event. In scenarios where the session
 * is invalid or the user is not present, it logs a failed authentication attempt and returns an iframe with an error message.
 *
 * @beta
 */
export async function silentAuth({
  ctx,
  client,
  session,
  redirect_uri,
  state,
  nonce,
  code_challenge_method,
  code_challenge,
  audience,
  scope,
}: SilentAuthParams) {
  const { env } = ctx;

  const redirectURL = new URL(redirect_uri);

  if (session) {
    ctx.set("user_id", session.user_id);

    // Update the cookie
    const headers = new Headers();
    const cookie = serializeAuthCookie(client.tenant.id, session.id);
    headers.set("set-cookie", cookie);

    const user = await env.data.users.get(client.tenant.id, session.user_id);

    if (user) {
      ctx.set("username", user.email);
      ctx.set("connection", user.connection);

      const tokenResponse = await createAuthTokens(ctx, {
        client,
        authParams: {
          client_id: client.id,
          audience,
          code_challenge_method,
          code_challenge,
          scope,
          state,
          nonce,
          // Always set the response type to token id_token for silent auth
          response_type: AuthorizationResponseType.TOKEN_ID_TOKEN,
        },
        user,
        session_id: session.session_id,
      });

      await env.data.sessions.update(client.tenant.id, session.id, {
        used_at: new Date().toISOString(),
      });

      const log = createLogMessage(ctx, {
        type: LogTypes.SUCCESS_SILENT_AUTH,
        description: "Successful silent authentication",
      });
      await ctx.env.data.logs.create(client.tenant.id, log);

      return ctx.html(
        renderAuthIframe(
          `${redirectURL.protocol}//${redirectURL.host}`,
          JSON.stringify(tokenResponse),
        ),
        {
          headers,
        },
      );
    }
  }

  const log = createLogMessage(ctx, {
    type: LogTypes.FAILED_SILENT_AUTH,
    description: "Login required",
  });
  await ctx.env.data.logs.create(client.tenant.id, log);

  return ctx.html(
    renderAuthIframe(
      `${redirectURL.protocol}//${redirectURL.host}`,
      JSON.stringify({
        error: "login_required",
        error_description: "Login required",
        state,
      }),
    ),
  );
}
