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
        session_id: session.id,
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
