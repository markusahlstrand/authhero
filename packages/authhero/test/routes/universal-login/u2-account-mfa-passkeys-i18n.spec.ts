import { describe, it, expect } from "vitest";
import { getTestServer } from "../../helpers/test-server";

type TestEnv = Awaited<ReturnType<typeof getTestServer>>["env"];

async function seedAccountSession(env: TestEnv, uiLocales?: string) {
  await env.data.users.create("tenantId", {
    user_id: "email|account-mfa-i18n",
    email: "account-mfa-i18n@example.com",
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
    id: "account-mfa-i18n-session",
    user_id: "email|account-mfa-i18n",
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
  cookie: "tenantId-auth-token=account-mfa-i18n-session",
};

const formHeaders = {
  ...headers,
  "content-type": "application/x-www-form-urlencoded",
};

describe("u2 account passkeys / MFA enrollment i18n", () => {
  it("renders the passkeys screen and its errors in Swedish", async () => {
    const { u2App, env } = await getTestServer();
    const state = await seedAccountSession(env, "sv");

    const getResponse = await u2App.request(
      `/account/passkeys?state=${encodeURIComponent(state)}`,
      { method: "GET", headers },
      env,
    );
    expect(getResponse.status).toBe(200);
    const getBody = await getResponse.text();
    expect(getBody).toContain("Du har inga registrerade passkeys.");
    expect(getBody).toContain("Lägg till passkey");
    expect(getBody).not.toContain("You have no passkeys registered.");
    expect(getBody).not.toContain("Add Passkey");

    const postResponse = await u2App.request(
      `/account/passkeys?state=${encodeURIComponent(state)}`,
      {
        method: "POST",
        headers: formHeaders,
        body: "action=remove_passkey&passkey_id=does-not-exist",
      },
      env,
    );
    const postBody = await postResponse.text();
    expect(postBody).toContain("Passkey hittades inte");
    expect(postBody).not.toContain("Passkey not found");
  });

  it("renders the phone enrollment screen and field errors in Swedish", async () => {
    const { u2App, env } = await getTestServer();
    const state = await seedAccountSession(env, "sv");

    const getResponse = await u2App.request(
      `/account/security/phone-enrollment?state=${encodeURIComponent(state)}`,
      { method: "GET", headers },
      env,
    );
    expect(getResponse.status).toBe(200);
    const getBody = await getResponse.text();
    expect(getBody).toContain("Skicka verifieringskod");
    expect(getBody).not.toContain("Send Verification Code");

    const postResponse = await u2App.request(
      `/account/security/phone-enrollment?state=${encodeURIComponent(state)}`,
      {
        method: "POST",
        headers: formHeaders,
        body: "action=submit_phone&phone_number=123",
      },
      env,
    );
    const postBody = await postResponse.text();
    expect(postBody).toContain("Ange ett giltigt telefonnummer");
    expect(postBody).not.toContain("Please enter a valid phone number");
  });

  it("renders the TOTP enrollment screen and field errors in Swedish", async () => {
    const { u2App, env } = await getTestServer();
    const state = await seedAccountSession(env, "sv");

    const getResponse = await u2App.request(
      `/account/security/totp-enrollment?state=${encodeURIComponent(state)}`,
      { method: "GET", headers },
      env,
    );
    expect(getResponse.status).toBe(200);
    const getBody = await getResponse.text();
    expect(getBody).toContain("Konfigurera autentiseringsapp");
    expect(getBody).toContain("Eller ange denna nyckel manuellt:");
    expect(getBody).not.toContain("Set Up Authenticator App");

    const postResponse = await u2App.request(
      `/account/security/totp-enrollment?state=${encodeURIComponent(state)}`,
      {
        method: "POST",
        headers: formHeaders,
        body: "code=000000",
      },
      env,
    );
    const postBody = await postResponse.text();
    expect(postBody).toContain("Ogiltig kod. Försök igen.");
    expect(postBody).not.toContain("Invalid code. Please try again.");
  });

  it("keeps the English copy by default", async () => {
    const { u2App, env } = await getTestServer();
    const state = await seedAccountSession(env);

    const response = await u2App.request(
      `/account/passkeys?state=${encodeURIComponent(state)}`,
      { method: "GET", headers },
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("You have no passkeys registered.");
    expect(body).toContain("Add Passkey");
  });
});
