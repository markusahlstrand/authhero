import { describe, it, expect } from "vitest";
import { getTestServer } from "../../helpers/test-server";

type TestEnv = Awaited<ReturnType<typeof getTestServer>>["env"];

const PROFILE_TITLE = "Min egen profilrubrik";
const DELETE_TITLE = "Min egen raderingsrubrik";
const DELETE_ERROR = "Eget fel: skriv DELETE";
const CONNECT_TITLE = "Min egen anslutningsrubrik";

async function seedAccountSession(env: TestEnv) {
  await env.data.users.create("tenantId", {
    user_id: "email|custom-text",
    email: "custom-text@example.com",
    email_verified: true,
    name: "Custom Text User",
    connection: "email",
    provider: "email",
    is_social: false,
  });

  const loginSession = await env.data.loginSessions.create("tenantId", {
    expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    csrf_token: "csrf",
    authParams: { client_id: "clientId", ui_locales: "sv" },
  });

  await env.data.sessions.create("tenantId", {
    id: "custom-text-session",
    user_id: "email|custom-text",
    clients: ["clientId"],
    expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    used_at: new Date().toISOString(),
    login_session_id: loginSession.id,
    device: {
      last_ip: "",
      initial_ip: "",
      last_user_agent: "",
      initial_user_agent: "",
      initial_asn: "",
      last_asn: "",
    },
  });

  await env.data.customText.set("tenantId", "common", "sv", {
    "account-profile": { title: PROFILE_TITLE },
    "account-delete": { title: DELETE_TITLE, confirmationError: DELETE_ERROR },
  });

  return loginSession.id;
}

const accountHeaders = {
  "tenant-id": "tenantId",
  cookie: "tenantId-auth-token=custom-text-session",
};

describe("u2 tenant custom text on account and connect screens", () => {
  it("applies the common override on the HTML account-profile route", async () => {
    const { u2App, env } = await getTestServer();
    const state = await seedAccountSession(env);

    const response = await u2App.request(
      `/account/profile?state=${encodeURIComponent(state)}`,
      { method: "GET", headers: accountHeaders },
      env,
    );

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain(PROFILE_TITLE);
    expect(body).not.toContain("Redigera profil");
  });

  it("applies the common override on the JSON account-profile screen", async () => {
    const { u2App, env } = await getTestServer();
    const state = await seedAccountSession(env);

    const response = await u2App.request(
      `/screen/account-profile?state=${encodeURIComponent(state)}`,
      { method: "GET", headers: accountHeaders },
      env,
    );

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain(PROFILE_TITLE);
    expect(body).not.toContain("Redigera profil");
  });

  it("keeps the common override when a JSON POST re-renders with an error", async () => {
    const { u2App, env } = await getTestServer();
    const state = await seedAccountSession(env);

    const response = await u2App.request(
      `/screen/account-delete?state=${encodeURIComponent(state)}`,
      {
        method: "POST",
        headers: {
          ...accountHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({ data: { confirmation: "RADERA" } }),
      },
      env,
    );

    const body = await response.text();
    expect(body).toContain(DELETE_TITLE);
    expect(body).toContain(DELETE_ERROR);
    expect(body).not.toContain("Radera konto");

    const user = await env.data.users.get("tenantId", "email|custom-text");
    expect(user).not.toBeNull();
  });

  it("applies the consent override on the connect-consent screen (HTML and JSON)", async () => {
    const { oauthApp, u2App, env } = await getTestServer();
    await env.data.tenants.update("tenantId", {
      flags: {
        enable_dynamic_client_registration: true,
        dcr_require_initial_access_token: true,
      },
    });
    await env.data.customText.set("tenantId", "consent", "sv", {
      "connect-consent": { title: CONNECT_TITLE },
    });

    const qs = new URLSearchParams({
      integration_type: "wordpress",
      domain: "publisher.com",
      return_to: "https://publisher.com/wp-admin/connect-callback",
      state: "csrf-abc",
    }).toString();
    const start = await oauthApp.request(
      `/connect/start?${qs}`,
      { method: "GET", headers: { "tenant-id": "tenantId" } },
      env,
    );
    expect(start.status).toBe(302);
    const location = start.headers.get("location");
    expect(location).toBeTruthy();
    const stateId =
      new URL(location ?? "", "http://localhost").searchParams.get("state") ??
      "";

    const session = await env.data.sessions.create("tenantId", {
      id: "custom-text-connect-session",
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
    const headers = {
      "tenant-id": "tenantId",
      cookie: `tenantId-auth-token=${session.id}`,
    };

    const html = await u2App.request(
      `/connect/start?state=${encodeURIComponent(stateId)}&ui_locales=sv`,
      { method: "GET", headers },
      env,
    );
    expect(html.status).toBe(200);
    const htmlBody = await html.text();
    expect(htmlBody).toContain(CONNECT_TITLE);
    expect(htmlBody).not.toContain("Anslut applikation");

    const json = await u2App.request(
      `/screen/connect-consent?state=${encodeURIComponent(stateId)}&ui_locales=sv`,
      { method: "GET", headers },
      env,
    );
    expect(json.status).toBe(200);
    const jsonBody = await json.text();
    expect(jsonBody).toContain(CONNECT_TITLE);
    expect(jsonBody).not.toContain("Anslut applikation");
  });
});
