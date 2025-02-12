import { describe, expect, it } from "vitest";
import { getTestServer } from "../helpers/test-server";
import { nanoid } from "nanoid";

describe("sessions", () => {
  describe("get", () => {
    it.skip("should create and get a session", async () => {
      const db = await getTestServer();

      await db.tenants.create({
        id: "tenantId",
        name: "Test Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });

      // Add a client
      await db.applications.create("tenantId", {
        id: "clientId",
        client_secret: "clientSecret",
        name: "Test Client",
        callbacks: ["https://example.com/callback"],
        allowed_logout_urls: ["https://example.com/callback"],
        web_origins: ["https://example.com"],
        disable_sign_ups: false,
      });

      // Add a test user
      await db.users.create("tenantId", {
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

      const id = nanoid();

      const sessionData = {
        id,
        user_id: "email|userId",
        client_id: "clientId",
        used_at: "2021-01-01T00:00:00.000Z",
        device: {
          last_ip: "",
          initial_ip: "",
          last_user_agent: "",
          initial_user_agent: "",
          initial_asn: "",
          last_asn: "",
        },
        clients: [],
      };

      await db.sessions.create("tenantId", sessionData);

      const session = await db.sessions.get("tenantId", id);

      expect(session).matchSnapshot(sessionData);
    });
  });
});
