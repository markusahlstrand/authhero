import { describe, expect, it } from "vitest";
import { getTestServer } from "../helpers/test-server";
import { nanoid } from "nanoid";
import {
  AuthorizationResponseType,
  LoginSessionState,
} from "@authhero/adapter-interfaces";

describe("sessions", () => {
  describe("get", () => {
    it("should create and get a session", async () => {
      const { data } = await getTestServer();

      await data.tenants.create({
        id: "tenantId",
        friendly_name: "Test Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });

      // Add a client
      await data.clients.create("tenantId", {
        client_id: "client123",
        client_secret: "clientSecret",
        name: "Test Client",
        callbacks: ["https://example.com/callback"],
        allowed_logout_urls: ["https://example.com/callback"],
        web_origins: ["https://example.com"],
        client_metadata: {
          disable_sign_ups: "false",
        },
      });

      // Add a test user
      await data.users.create("tenantId", {
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

      const createdLoginSession = await data.loginSessions.create("tenantId", {
        csrf_token: "csrf123",
        authParams: {
          client_id: "client123",
          response_type: AuthorizationResponseType.CODE,
          scope: "openid profile",
          state: "state123",
        },
        expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
        ip: "127.0.0.1",
        useragent: "jest",
        state: LoginSessionState.PENDING,
      });

      await data.sessions.create("tenantId", {
        id,
        user_id: "email|userId",
        login_session_id: createdLoginSession.id,
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
      });

      const session = await data.sessions.get("tenantId", id);

      expect(session).toMatchObject({
        id,
        user_id: "email|userId",
        login_session_id: createdLoginSession.id,
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
      });
    });
  });
});
