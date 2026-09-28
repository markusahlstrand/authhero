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

async function seedSession(
  data: Awaited<ReturnType<typeof getTestServer>>["data"],
  tenantId: string,
  sessionId: string,
) {
  await data.clients.create(tenantId, {
    client_id: "clientId",
    client_secret: "clientSecret",
    name: "Test Client",
    callbacks: ["https://example.com/callback"],
    allowed_logout_urls: ["https://example.com/callback"],
    web_origins: ["https://example.com"],
    client_metadata: {},
  });
  await data.users.create(tenantId, {
    email: "foo@example.com",
    email_verified: true,
    name: "Test User",
    nickname: "Test User",
    picture: "https://example.com/test.png",
    connection: "email",
    provider: "email",
    is_social: false,
    user_id: "email|userId",
  });

  const loginSession = await data.loginSessions.create(tenantId, {
    csrf_token: "csrfToken",
    authParams: {
      client_id: "clientId",
      response_type: AuthorizationResponseType.CODE,
      scope: "openid profile",
    },
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    state: LoginSessionState.PENDING,
  });

  return data.sessions.create(tenantId, {
    id: sessionId,
    login_session_id: loginSession.id,
    user_id: "email|userId",
    clients: [],
    device,
  });
}

describe("sessions", () => {
  describe("update", () => {
    it("updates an existing session and returns true", async () => {
      const { data } = await getTestServer();
      await data.tenants.create({
        id: "tenantId",
        friendly_name: "Test Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });
      const session = await seedSession(data, "tenantId", "sessionId");

      const result = await data.sessions.update("tenantId", session.id, {
        revoked_at: new Date().toISOString(),
      });

      expect(result).toBe(true);
      const updated = await data.sessions.get("tenantId", session.id);
      expect(updated?.revoked_at).toBeTruthy();
    });

    it("returns false for an unknown session id", async () => {
      const { data } = await getTestServer();
      await data.tenants.create({
        id: "tenantId",
        friendly_name: "Test Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });

      const result = await data.sessions.update("tenantId", "does-not-exist", {
        revoked_at: new Date().toISOString(),
      });

      expect(result).toBe(false);
    });

    it("returns false and does not update a session belonging to another tenant", async () => {
      const { data } = await getTestServer();
      await data.tenants.create({
        id: "tenantId",
        friendly_name: "Test Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });
      await data.tenants.create({
        id: "otherTenant",
        friendly_name: "Other Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });
      const session = await seedSession(data, "otherTenant", "sessionId");

      const result = await data.sessions.update("tenantId", session.id, {
        revoked_at: new Date().toISOString(),
      });

      expect(result).toBe(false);
      const untouched = await data.sessions.get("otherTenant", session.id);
      expect(untouched?.revoked_at).toBeFalsy();
    });
  });
});
