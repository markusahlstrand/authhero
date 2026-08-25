import { describe, expect, it } from "vitest";
import { getTestServer } from "../helpers/test-server";
import {
  AuthorizationResponseType,
  LoginSessionState,
} from "@authhero/adapter-interfaces";

async function seedTenantAndClient(data: any) {
  await data.tenants.create({
    id: "tenantId",
    friendly_name: "Test Tenant",
    audience: "https://example.com",
    sender_email: "login@example.com",
    sender_name: "SenderName",
  });

  await data.clients.create("tenantId", {
    client_id: "clientId",
    client_secret: "clientSecret",
    name: "Test Client",
    callbacks: ["https://example.com/callback"],
    allowed_logout_urls: ["https://example.com/callback"],
    web_origins: ["https://example.com"],
    client_metadata: {},
  });
}

async function createLoginSession(data: any) {
  return data.loginSessions.create("tenantId", {
    csrf_token: "csrf",
    authParams: {
      client_id: "clientId",
      response_type: AuthorizationResponseType.CODE,
      scope: "openid offline_access",
    },
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    state: LoginSessionState.PENDING,
  });
}

const device = {
  last_ip: "",
  initial_ip: "",
  last_user_agent: "",
  initial_user_agent: "",
  initial_asn: "",
  last_asn: "",
};

async function seedTokens(data: any) {
  await seedTenantAndClient(data);
  // Two login sessions feeding one session — the SSO re-authorization case a
  // login-keyed cascade misses.
  const first = await createLoginSession(data);
  const later = await createLoginSession(data);
  const other = await createLoginSession(data);

  const mk = (id: string, login_id: string, session_id?: string) =>
    data.refreshTokens.create("tenantId", {
      id,
      login_id,
      session_id,
      user_id: "email|userId",
      client_id: "clientId",
      resource_servers: [{ audience: "http://example.com", scopes: "openid" }],
      device,
      rotating: true,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      idle_expires_at: new Date(Date.now() + 3600_000).toISOString(),
    });

  await mk("rt-first-login", first.id, "sess-1");
  await mk("rt-later-login", later.id, "sess-1");
  await mk("rt-other-session", other.id, "sess-2");
  await mk("rt-legacy", first.id, undefined);

  return { firstLoginId: first.id };
}

describe("refresh tokens — revokeBySession", () => {
  it("revokes every token owned by the session, whatever login minted it", async () => {
    const { data } = await getTestServer();
    await seedTokens(data);

    const revoked = await data.refreshTokens.revokeBySession(
      "tenantId",
      "sess-1",
      new Date().toISOString(),
    );
    expect(revoked).toBe(2);

    expect(
      (await data.refreshTokens.get("tenantId", "rt-first-login"))!.revoked_at,
    ).toBeTruthy();
    expect(
      (await data.refreshTokens.get("tenantId", "rt-later-login"))!.revoked_at,
    ).toBeTruthy();
    // Another session for the same user is untouched.
    expect(
      (await data.refreshTokens.get("tenantId", "rt-other-session"))!
        .revoked_at,
    ).toBeFalsy();
    // And so is a row minted before the column existed.
    expect(
      (await data.refreshTokens.get("tenantId", "rt-legacy"))!.revoked_at,
    ).toBeFalsy();
  });

  it("skips already-revoked rows so the first timestamp survives", async () => {
    const { data } = await getTestServer();
    await seedTokens(data);

    const first = new Date(Date.now() - 60_000).toISOString();
    expect(
      await data.refreshTokens.revokeBySession("tenantId", "sess-1", first),
    ).toBe(2);
    expect(
      await data.refreshTokens.revokeBySession(
        "tenantId",
        "sess-1",
        new Date().toISOString(),
      ),
    ).toBe(0);

    const stored = await data.refreshTokens.get("tenantId", "rt-first-login");
    expect(stored!.revoked_at).toBe(first);
  });

  it("still reaches legacy rows through the login-session sweep", async () => {
    const { data } = await getTestServer();
    const { firstLoginId } = await seedTokens(data);

    // What the helper's second sweep does for pre-session_id rows.
    const revoked = await data.refreshTokens.revokeByLoginSession(
      "tenantId",
      firstLoginId,
      new Date().toISOString(),
    );
    expect(revoked).toBe(2); // rt-first-login and rt-legacy

    expect(
      (await data.refreshTokens.get("tenantId", "rt-legacy"))!.revoked_at,
    ).toBeTruthy();
  });
});
