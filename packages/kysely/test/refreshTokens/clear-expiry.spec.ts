import { describe, expect, it } from "vitest";
import { getTestServer } from "../helpers/test-server";
import {
  AuthorizationResponseType,
  LoginSessionState,
} from "@authhero/adapter-interfaces";

// `update` is three-valued on the expiry columns: `undefined` leaves the
// stored value alone, a string overwrites it, `null` clears it. Clearing is
// what a non-rotating refresh exchange needs when its client has been switched
// to a non-expiring refresh-token config — the row it keeps handing back has
// to lose the expiries it was stamped with at mint.
describe("refresh tokens — clearing the expiry columns", () => {
  const expires_at = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const idle_expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  async function seed() {
    const { data } = await getTestServer();

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
    const ls = await data.loginSessions.create("tenantId", {
      csrf_token: "csrf",
      authParams: {
        client_id: "clientId",
        response_type: AuthorizationResponseType.CODE,
        scope: "openid offline_access",
      },
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      state: LoginSessionState.PENDING,
    });

    await data.refreshTokens.create("tenantId", {
      id: "rt-1",
      login_id: ls.id,
      user_id: "email|userId",
      client_id: "clientId",
      resource_servers: [{ audience: "http://example.com", scopes: "openid" }],
      device: {
        last_ip: "",
        initial_ip: "",
        last_user_agent: "",
        initial_user_agent: "",
        initial_asn: "",
        last_asn: "",
      },
      rotating: false,
      expires_at,
      idle_expires_at,
    });

    return data;
  }

  it("clears both expiry columns when passed null", async () => {
    const data = await seed();

    await data.refreshTokens.update("tenantId", "rt-1", {
      expires_at: null,
      idle_expires_at: null,
    });

    const row = await data.refreshTokens.get("tenantId", "rt-1");
    expect(row?.expires_at).toBeFalsy();
    expect(row?.idle_expires_at).toBeFalsy();
  });

  it("leaves a column untouched when it is omitted", async () => {
    const data = await seed();

    await data.refreshTokens.update("tenantId", "rt-1", { expires_at: null });

    const row = await data.refreshTokens.get("tenantId", "rt-1");
    expect(row?.expires_at).toBeFalsy();
    expect(row?.idle_expires_at).toBe(idle_expires_at);
  });
});
