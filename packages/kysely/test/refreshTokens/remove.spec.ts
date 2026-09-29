import { describe, expect, it } from "vitest";
import { getTestServer } from "../helpers/test-server";
import {
  AuthorizationResponseType,
  LoginSessionState,
} from "@authhero/adapter-interfaces";

const device = {
  last_ip: "",
  initial_ip: "",
  last_user_agent: "",
  initial_user_agent: "",
  initial_asn: "",
  last_asn: "",
};

async function seed(tenantId: string) {
  const { data } = await getTestServer();

  await data.tenants.create({
    id: tenantId,
    friendly_name: "Test Tenant",
    audience: "https://example.com",
    sender_email: "login@example.com",
    sender_name: "SenderName",
  });
  await data.clients.create(tenantId, {
    client_id: "clientId",
    client_secret: "clientSecret",
    name: "Test Client",
    callbacks: ["https://example.com/callback"],
    allowed_logout_urls: ["https://example.com/callback"],
    web_origins: ["https://example.com"],
    client_metadata: {},
  });
  const ls = await data.loginSessions.create(tenantId, {
    csrf_token: "csrf",
    authParams: {
      client_id: "clientId",
      response_type: AuthorizationResponseType.CODE,
      scope: "openid offline_access",
    },
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    state: LoginSessionState.PENDING,
  });

  await data.refreshTokens.create(tenantId, {
    id: "rt-1",
    login_id: ls.id,
    user_id: "email|userId",
    client_id: "clientId",
    resource_servers: [{ audience: "http://example.com", scopes: "openid" }],
    device,
    rotating: false,
  });

  return data;
}

describe("refreshTokens", () => {
  describe("remove", () => {
    it("removes an existing refresh token and returns true", async () => {
      const data = await seed("tenantId");

      const result = await data.refreshTokens.remove("tenantId", "rt-1");

      expect(result).toBe(true);
      expect(await data.refreshTokens.get("tenantId", "rt-1")).toBeNull();
    });

    it("returns false for an unknown refresh token id", async () => {
      const data = await seed("tenantId");

      const result = await data.refreshTokens.remove(
        "tenantId",
        "does-not-exist",
      );

      expect(result).toBe(false);
    });

    it("returns false and does not remove a refresh token belonging to another tenant", async () => {
      const data = await seed("tenantId");
      await data.tenants.create({
        id: "otherTenant",
        friendly_name: "Other Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });

      const result = await data.refreshTokens.remove("otherTenant", "rt-1");

      expect(result).toBe(false);
      expect(await data.refreshTokens.get("tenantId", "rt-1")).not.toBeNull();
    });
  });
});
