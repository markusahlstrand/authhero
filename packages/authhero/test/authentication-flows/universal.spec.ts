import { describe, it, expect } from "vitest";
import { getTestServer } from "../helpers/test-server";
import { testClient } from "hono/testing";

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

    const loginSession = await env.data.logins.get("tenantId", state!);
    expect(loginSession).toMatchObject({
      login_id: state,
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

    const session = await env.data.sessions.create("tenantId", {
      id: "sessionId",
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
});
