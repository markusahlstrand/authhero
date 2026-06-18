import { describe, it, expect } from "vitest";
import { getTestServer } from "../helpers/test-server";
import { testClient } from "hono/testing";
import {
  AuthorizationResponseType,
  LogTypes,
} from "@authhero/adapter-interfaces";
import { HookEvent } from "../../src/types/Hooks";

describe("universal", () => {
  it("should create a login session and return a redirect", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    const response = await oauthClient.authorize.$get(
      {
        query: {
          client_id: "clientId",
          redirect_uri: "https://example.com/callback",
          state: "state",
          ui_locales: "en",
          response_type: AuthorizationResponseType.CODE,
        },
      },
      {
        headers: {
          origin: "https://example.com",
        },
      },
    );

    expect(response.status).toEqual(302);
    const location = response.headers.get("location");
    const state = location?.split("state=")[1];

    const loginSession = await env.data.loginSessions.get("tenantId", state!);
    expect(loginSession).toMatchObject({
      id: state,
      authParams: {
        redirect_uri: "https://example.com/callback",
        state: "state",
        client_id: "clientId",
        ui_locales: "en",
      },
    });
  });

  it("should return a auth response if the login hint matches the current email_hint", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        username: "foo@example.com",
        redirect_uri: "https://example.com/callback",
      },
    });

    const session = await env.data.sessions.create("tenantId", {
      id: "sessionId",
      login_session_id: loginSession.id,
      user_id: "email|userId",
      clients: ["clientId"],
      expires_at: new Date(Date.now() + 1000).toISOString(),
      used_at: new Date().toISOString(),
      device: {
        last_ip: "",
        initial_ip: "",
        last_user_agent: "",
        initial_user_agent: "",
        initial_asn: "",
        last_asn: "",
      },
    });

    const response = await oauthClient.authorize.$get(
      {
        query: {
          client_id: "clientId",
          redirect_uri: "https://example.com/callback",
          state: "state",
          ui_locales: "en",
          login_hint: "foo@example.com",
          response_type: AuthorizationResponseType.CODE,
        },
      },
      {
        headers: {
          cookie: `tenantId-auth-token=${session.id}`,
          origin: "https://example.com",
        },
      },
    );

    expect(response.status).toEqual(302);
    const location = response.headers.get("location");
    if (!location) {
      throw new Error("No location header found");
    }
    const redirectUri = new URL(location);

    expect(redirectUri.pathname).toEqual("/callback");
    expect(redirectUri.hostname).toEqual("example.com");

    const code = redirectUri.searchParams.get("code");
    if (!code) {
      throw new Error("No code found in redirect uri");
    }

    const dbCode = await env.data.codes.get(
      "tenantId",
      code,
      "authorization_code",
    );
    expect(dbCode).toMatchObject({
      code_id: code,
      code_type: "authorization_code",
    });
  });

  it("logs the original connection (not the primary identity) on SSO session reuse", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    // Capture the post-login hook event so we can assert the connection it sees.
    let capturedEvent: HookEvent | undefined;
    env.hooks = {
      onExecutePostLogin: async (event: HookEvent) => {
        capturedEvent = event;
      },
    };

    // The user's *primary* identity is the database "email" connection
    // (test-server default), but the existing session was established via a
    // linked OIDC connection "vipps". The originating login session records
    // the real connection in `auth_connection` — note `auth_strategy` is left
    // unset, mirroring production data where only auth_connection is persisted
    // (it's stored early, before the provider round-trip).
    const originLoginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        response_type: AuthorizationResponseType.CODE,
      },
      auth_connection: "vipps",
    });

    const session = await env.data.sessions.create("tenantId", {
      id: "sessionId",
      login_session_id: originLoginSession.id,
      user_id: "email|userId",
      clients: ["clientId"],
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      idle_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      used_at: new Date().toISOString(),
      device: {
        last_ip: "",
        initial_ip: "",
        last_user_agent: "",
        initial_user_agent: "",
        initial_asn: "",
        last_asn: "",
      },
    });

    const response = await oauthClient.authorize.$get(
      {
        query: {
          client_id: "clientId",
          redirect_uri: "https://example.com/callback",
          state: "state",
          ui_locales: "en",
          response_type: AuthorizationResponseType.CODE,
        },
      },
      {
        headers: {
          cookie: `tenantId-auth-token=${session.id}`,
          origin: "https://example.com",
        },
      },
    );

    // SSO reuse completes the login and redirects back with a code.
    expect(response.status).toEqual(302);

    const { logs } = await env.data.logs.list("tenantId", {
      page: 0,
      per_page: 50,
      include_totals: true,
    });
    const successLogin = logs.find((l) => l.type === LogTypes.SUCCESS_LOGIN);
    expect(successLogin).toBeDefined();
    // Before the fix this fell back to the primary identity's connection
    // ("email") instead of the connection actually used ("vipps", recovered
    // from the originating login session's auth_connection).
    expect(successLogin?.connection).toEqual("vipps");

    // The post-login hook event must see the same real connection — not the
    // primary identity's `user.connection`.
    expect(capturedEvent).toBeDefined();
    expect(capturedEvent!.connection?.name).toEqual("vipps");
  });
});
