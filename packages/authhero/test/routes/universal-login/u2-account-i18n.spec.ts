import { describe, it, expect } from "vitest";
import { getTestServer } from "../../helpers/test-server";

type TestEnv = Awaited<ReturnType<typeof getTestServer>>["env"];

async function seedAccountSession(env: TestEnv, uiLocales?: string) {
  await env.data.users.create("tenantId", {
    user_id: "email|account-i18n",
    email: "account-i18n@example.com",
    email_verified: true,
    name: "Account User",
    connection: "email",
    provider: "email",
    is_social: false,
  });

  const loginSession = await env.data.loginSessions.create("tenantId", {
    expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    csrf_token: "csrf",
    authParams: {
      client_id: "clientId",
      ...(uiLocales ? { ui_locales: uiLocales } : {}),
    },
  });

  await env.data.sessions.create("tenantId", {
    id: "account-i18n-session",
    user_id: "email|account-i18n",
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

  return loginSession.id;
}

const headers = {
  "tenant-id": "tenantId",
  cookie: "tenantId-auth-token=account-i18n-session",
};

describe("u2 account screens i18n", () => {
  it("renders the account hub in Swedish", async () => {
    const { u2App, env } = await getTestServer();
    const state = await seedAccountSession(env, "sv");

    const response = await u2App.request(
      `/account?state=${encodeURIComponent(state)}`,
      { method: "GET", headers },
      env,
    );

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("Kontoinställningar");
    expect(body).toContain("Radera konto");
    expect(body).not.toContain("Account Settings");
    expect(body).not.toContain("Delete Account");
  });

  it("renders the delete screen in Swedish and still requires the literal DELETE", async () => {
    const { u2App, env } = await getTestServer();
    const state = await seedAccountSession(env, "sv");

    const getResponse = await u2App.request(
      `/account/delete?state=${encodeURIComponent(state)}`,
      { method: "GET", headers },
      env,
    );
    expect(getResponse.status).toBe(200);
    const getBody = await getResponse.text();
    expect(getBody).toContain("Radera mitt konto");
    expect(getBody).toContain("DELETE");
    expect(getBody).not.toContain("Delete My Account");
    expect(getBody).not.toContain("Warning: This action is permanent");

    const postResponse = await u2App.request(
      `/account/delete?state=${encodeURIComponent(state)}`,
      {
        method: "POST",
        headers: {
          ...headers,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "confirmation=RADERA",
      },
      env,
    );
    const postBody = await postResponse.text();
    expect(postBody).toContain("för att bekräfta");
    expect(postBody).not.toContain("Please type");

    // The user still exists because the confirmation word did not match
    const user = await env.data.users.get("tenantId", "email|account-i18n");
    expect(user).not.toBeNull();
  });

  it("keeps the English copy by default", async () => {
    const { u2App, env } = await getTestServer();
    const state = await seedAccountSession(env);

    const response = await u2App.request(
      `/account/delete?state=${encodeURIComponent(state)}`,
      { method: "GET", headers },
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("Delete My Account");
    expect(body).toContain('Type "DELETE" to confirm');
  });
});
