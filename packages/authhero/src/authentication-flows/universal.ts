import { Context } from "hono";
import { UNIVERSAL_AUTH_SESSION_EXPIRES_IN_SECONDS } from "../constants";
import {
  AuthParams,
  Session,
} from "@authhero/adapter-interfaces";
import { EnrichedClient } from "../helpers/client";
import { Bindings, Variables } from "../types";
import { createFrontChannelAuthResponse } from "./common";
import { sendLink } from "../emails";
import generateOTP from "../utils/otp";
import { nanoid } from "nanoid";
import { stringifyAuth0Client } from "../utils/client-info";

interface UniversalAuthParams {
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>;
  client: EnrichedClient;
  session?: Session;
  authParams: AuthParams;
  auth0Client?: string;
  connection?: string;
  login_hint?: string;
}

// Helper function to check if session has exceeded max_age
function isSessionExpiredByMaxAge(
  session: Session | undefined,
  maxAge: number | undefined,
): boolean {
  if (!session || maxAge === undefined) {
    return false;
  }
  
  // Check if session's authenticated_at is older than max_age seconds
  const authenticatedAt = new Date(session.authenticated_at).getTime();
  const maxAgeMs = maxAge * 1000;
  const now = Date.now();
  
  return now - authenticatedAt > maxAgeMs;
}

export async function universalAuth({
  ctx,
  session,
  client,
  authParams,
  connection,
  login_hint,
}: UniversalAuthParams) {
  const url = new URL(ctx.req.url);
  if (ctx.var.custom_domain) {
    url.hostname = ctx.var.custom_domain;
  }

  const { ip, auth0_client, useragent } = ctx.var;

  // Convert structured auth0_client back to string for storage
  const auth0Client = stringifyAuth0Client(auth0_client);

  // OIDC Core 3.1.2.1: If max_age is present and session is older than max_age,
  // we must re-authenticate the user (treat as if there's no session)
  if (isSessionExpiredByMaxAge(session, authParams.max_age)) {
    session = undefined;
  }

  const loginSession = await ctx.env.data.loginSessions.create(
    client.tenant.id,
    {
      expires_at: new Date(
        Date.now() + UNIVERSAL_AUTH_SESSION_EXPIRES_IN_SECONDS * 1000,
      ).toISOString(),
      authParams,
      csrf_token: nanoid(),
      authorization_url: url.toString(),
      ip,
      useragent,
      auth0Client,
    },
  );

  // Determine route prefix based on client metadata
  // Set client_metadata.universal_login_version to "2" to use /u2 routes
  const routePrefix =
    client.client_metadata?.universal_login_version === "2" ? "/u2" : "/u";

  // Check if the user in the login_hint matches the user in the session
  if (session && login_hint) {
    const user = await ctx.env.data.users.get(
      client.tenant.id,
      session.user_id,
    );

    if (user?.email === login_hint) {
      // Let createFrontChannelAuthResponse handle the session linking and state transitions
      // It will authenticate the login session with the existing session
      return createFrontChannelAuthResponse(ctx, {
        client,
        loginSession,
        authParams,
        user,
        existingSessionIdToLink: session.id,
      });
    }
  }

  // If there's an email connection and a login_hint we redirect to the check-account page. This feels like code that will be duplicated
  if (connection === "email" && login_hint) {
    const otp = generateOTP();
    await ctx.env.data.codes.create(client.tenant.id, {
      code_id: otp,
      code_type: "otp",
      login_id: loginSession.id,
      expires_at: new Date(
        Date.now() + UNIVERSAL_AUTH_SESSION_EXPIRES_IN_SECONDS * 1000,
      ).toISOString(),
      redirect_uri: authParams.redirect_uri,
    });
    await sendLink(ctx, {
      code: otp,
      to: login_hint,
      authParams,
    });

    return ctx.redirect(`${routePrefix}/enter-code?state=${loginSession.id}`);
  }

  // If there is a session we redirect to the check-account page
  if (session) {
    return ctx.redirect(`${routePrefix}/check-account?state=${loginSession.id}`);
  }

  return ctx.redirect(`${routePrefix}/login/identifier?state=${loginSession.id}`);
}
