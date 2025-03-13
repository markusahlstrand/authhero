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
import { SILENT_AUTH_MAX_AGE_IN_SECONDS } from "../constants";

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
  response_type,
}: SilentAuthParams) {
  const { env } = ctx;
  const redirectURL = new URL(redirect_uri);
  const originUrl = `${redirectURL.protocol}//${redirectURL.host}`;

  // Helper function to handle login required scenarios
  async function handleLoginRequired(description: string = "Login required") {
    const log = createLogMessage(ctx, {
      type: LogTypes.FAILED_SILENT_AUTH,
      description,
    });
    await ctx.env.data.logs.create(client.tenant.id, log);

    return ctx.html(
      renderAuthIframe(
        originUrl,
        JSON.stringify({
          error: "login_required",
          error_description: description,
          state,
        }),
      ),
    );
  }

  // Check if session is valid
  const isSessionExpired =
    !session ||
    (session?.expires_at && new Date(session.expires_at) < new Date()) ||
    (session?.idle_expires_at &&
      new Date(session.idle_expires_at) < new Date());

  if (isSessionExpired) {
    return handleLoginRequired();
  }

  ctx.set("user_id", session.user_id);

  const user = await env.data.users.get(client.tenant.id, session.user_id);

  if (!user) {
    console.error("User not found", session.user_id);
    return handleLoginRequired("User not found");
  }

  ctx.set("username", user.email);
  ctx.set("connection", user.connection);

  // Create authentication tokens
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
      response_type,
    },
    user,
    session_id: session.id,
  });

  // Update session
  await env.data.sessions.update(client.tenant.id, session.id, {
    used_at: new Date().toISOString(),
    last_interaction_at: new Date().toISOString(),
    device: {
      ...session.device,
      last_ip: ctx.req.header("x-real-ip") || "",
      last_user_agent: ctx.req.header("user-agent") || "",
    },
    idle_expires_at: session.idle_expires_at
      ? new Date(
          Date.now() + SILENT_AUTH_MAX_AGE_IN_SECONDS * 1000,
        ).toISOString()
      : undefined,
  });

  // Log successful authentication
  const log = createLogMessage(ctx, {
    type: LogTypes.SUCCESS_SILENT_AUTH,
    description: "Successful silent authentication",
  });
  await ctx.env.data.logs.create(client.tenant.id, log);

  // Set response headers
  const headers = new Headers();
  // The following header is added to prevent Cloudflare from adding the beacon script to the file which might mess with Safari ITP
  headers.set("Server-Timing", "cf-nel=0; no-cloudflare-insights=1");

  const cookie = serializeAuthCookie(client.tenant.id, session.id);
  headers.set("set-cookie", cookie);

  return ctx.html(renderAuthIframe(originUrl, JSON.stringify(tokenResponse)), {
    headers,
  });
}
