import { describe, it, expect } from "vitest";
import { getTestServer } from "../../helpers/test-server";
import type { Bindings } from "../../../src/types";

const CONNECT_QS = new URLSearchParams({
  integration_type: "wordpress",
  domain: "publisher.com",
  return_to: "https://publisher.com/wp-admin/connect-callback",
  state: "csrf-abc",
}).toString();

async function createUserSession(env: Bindings) {
  return env.data.sessions.create("tenantId", {
    id: "session_i18n",
    login_session_id: "ignored",
    user_id: "email|userId",
    clients: ["clientId"],
    expires_at: new Date(Date.now() + 60_000).toISOString(),
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
}

describe("consent screens — localization", () => {
  it("renders the OAuth consent screen in Swedish", async () => {
    const { u2App, env } = await getTestServer();
    const session = await createUserSession(env);
    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      csrf_token: "csrfToken",
      session_id: session.id,
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        scope: "openid read:things",
        ui_locales: "sv",
      },
    });

    const response = await u2App.request(
      `/consent?state=${encodeURIComponent(loginSession.id)}`,
      {
        method: "GET",
        headers: {
          "tenant-id": "tenantId",
          cookie: `tenantId-auth-token=${session.id}`,
        },
      },
      env,
    );

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("read:things");
    expect(body).toContain("vill få åtkomst till ditt");
    expect(body).toContain("Godkänn");
    expect(body).toContain("Neka");
    expect(body).not.toContain("wants to access your");
    expect(body).not.toContain("It will be able to:");
  });

  it("renders the connect consent screen in Swedish", async () => {
    const { oauthApp, u2App, env } = await getTestServer();
    await env.data.tenants.update("tenantId", {
      flags: {
        enable_dynamic_client_registration: true,
        dcr_require_initial_access_token: true,
      },
    });
    const start = await oauthApp.request(
      `/connect/start?${CONNECT_QS}`,
      { method: "GET", headers: { "tenant-id": "tenantId" } },
      env,
    );
    expect(start.status).toBe(302);
    const stateId = new URL(
      start.headers.get("location")!,
      "http://localhost",
    ).searchParams.get("state")!;
    const session = await createUserSession(env);

    const response = await u2App.request(
      `/connect/start?state=${encodeURIComponent(stateId)}&ui_locales=sv`,
      {
        method: "GET",
        headers: {
          "tenant-id": "tenantId",
          cookie: `tenantId-auth-token=${session.id}`,
        },
      },
      env,
    );

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("publisher.com");
    expect(body).toContain("vill ansluta till ditt");
    expect(body).toContain("Anslut");
    expect(body).toContain("Avbryt");
    expect(body).not.toContain("wants to connect to your");
    expect(body).not.toContain("Connect application");
  });
});
