import { Context } from "hono";
import { UNIVERSAL_AUTH_SESSION_EXPIRES_IN_SECONDS } from "../constants";
import { AuthParams, Client, Session } from "@authhero/adapter-interfaces";
import { getClientInfo } from "../utils/client-info";
import { Bindings, Variables } from "../types";
import { createAuthResponse } from "./common";
import { sendLink } from "../emails";
import generateOTP from "../utils/otp";
import { nanoid } from "nanoid";

interface UniversalAuthParams {
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>;
  client: Client;
  session?: Session;
  authParams: AuthParams;
  auth0Client?: string;
  connection?: string;
  login_hint?: string;
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

  const loginSession = await ctx.env.data.loginSessions.create(
    client.tenant.id,
    {
      expires_at: new Date(
        Date.now() + UNIVERSAL_AUTH_SESSION_EXPIRES_IN_SECONDS * 1000,
      ).toISOString(),
      authParams,
      csrf_token: nanoid(),
      authorization_url: url.toString(),
      ...getClientInfo(ctx.req),
    },
  );

  // Check if the user in the login_hint matches the user in the session
  if (session && login_hint) {
    const user = await ctx.env.data.users.get(
      client.tenant.id,
      session.user_id,
    );

    if (user?.email === login_hint) {
      return createAuthResponse(ctx, {
        client,
        loginSession,
        authParams,
        user,
        sessionId: session.id,
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
    });
    await sendLink(ctx, {
      code: otp,
      to: login_hint,
      authParams,
    });

    return ctx.redirect(`/u/enter-code?state=${loginSession.id}`);
  }

  // If there is a session we redirect to the check-account page
  if (session) {
    return ctx.redirect(`/u/check-account?state=${loginSession.id}`);
  }

  return ctx.redirect(`/u/login/identifier?state=${loginSession.id}`);
}
