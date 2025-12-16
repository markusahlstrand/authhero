import { Context } from "hono";
import {
  AuthorizationResponseType,
  LegacyClient,
  CodeChallengeMethod,
  LogTypes,
  Session,
} from "@authhero/adapter-interfaces";
import { logMessage } from "../helpers/logging";
import { Bindings, Variables } from "../types";
import { serializeAuthCookie, clearAuthCookie } from "../utils/cookies";
import renderAuthIframe from "../utils/authIframe";
import { createAuthTokens, createCodeData } from "./common";
import { SILENT_AUTH_MAX_AGE_IN_SECONDS } from "../constants";
import { nanoid } from "nanoid";

interface SilentAuthParams {
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>;
  client: LegacyClient;
  session?: Session;
  redirect_uri: string;
  state: string;
  response_type: AuthorizationResponseType;
  nonce?: string;
  code_challenge_method?: CodeChallengeMethod;
  code_challenge?: string;
  audience?: string;
  scope?: string;
  organization?: string;
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
  organization,
}: SilentAuthParams) {
  const { env } = ctx;
  const redirectURL = new URL(redirect_uri);
  const originUrl = `${redirectURL.protocol}//${redirectURL.host}`;

  // Helper function to handle login required scenarios
  async function handleLoginRequired(description: string = "Login required") {
    const headers = new Headers();
    
    // Only log and clear the session cookie if there was actually a session
    if (session) {
      logMessage(ctx, client.tenant.id, {
        type: LogTypes.FAILED_SILENT_AUTH,
        description,
      });

      const clearCookie = clearAuthCookie(
        client.tenant.id,
        ctx.req.header("host"),
      );
      headers.set("set-cookie", clearCookie);
    }

    return renderAuthIframe(
      ctx,
      originUrl,
      JSON.stringify({
        error: "login_required",
        error_description: description,
        state,
      }),
      headers,
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

  // Create a new login session for this silent auth flow
  const loginSession = await env.data.loginSessions.create(client.tenant.id, {
    csrf_token: nanoid(),
    authParams: {
      client_id: client.client_id,
      audience,
      scope,
      state,
      nonce,
      response_type,
      redirect_uri,
      organization,
    },
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes
    session_id: session.id,
    ip: ctx.var.ip,
    useragent: ctx.var.useragent,
  });

  const tokenResponseOptions = {
    client,
    authParams: {
      client_id: client.client_id,
      audience,
      code_challenge_method,
      code_challenge,
      scope,
      state,
      nonce,
      response_type,
      redirect_uri,
    },
    user,
    session_id: session.id,
  };

  // Create authentication tokens or code
  const tokenResponse =
    response_type === AuthorizationResponseType.CODE
      ? await createCodeData(ctx, {
          user,
          client,
          authParams: tokenResponseOptions.authParams,
          login_id: loginSession.id,
        })
      : await createAuthTokens(ctx, tokenResponseOptions);

  // Update session
  await env.data.sessions.update(client.tenant.id, session.id, {
    used_at: new Date().toISOString(),
    last_interaction_at: new Date().toISOString(),
    login_session_id: loginSession.id,
    device: {
      ...session.device,
      last_ip: ctx.var.ip || "",
      last_user_agent: ctx.var.useragent || "",
    },
    idle_expires_at: session.idle_expires_at
      ? new Date(
          Date.now() + SILENT_AUTH_MAX_AGE_IN_SECONDS * 1000,
        ).toISOString()
      : undefined,
  });

  // Log successful authentication
  logMessage(ctx, client.tenant.id, {
    type: LogTypes.SUCCESS_SILENT_AUTH,
    description: "Successful silent authentication",
  });

  // Set response headers
  const headers = new Headers();
  const cookie = serializeAuthCookie(
    client.tenant.id,
    session.id,
    ctx.req.header("host"),
  );
  headers.set("set-cookie", cookie);

  return renderAuthIframe(
    ctx,
    originUrl,
    JSON.stringify({
      ...tokenResponse,
      state,
    }),
    headers,
  );
}
