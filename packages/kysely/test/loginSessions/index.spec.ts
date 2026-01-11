import { describe, expect, it } from "vitest";
import { getTestServer } from "../helpers/test-server";
import {
  AuthorizationResponseType,
  LoginSessionState,
} from "@authhero/adapter-interfaces";

describe("loginSessions", () => {
  it("should support crud operations", async () => {
    const { data } = await getTestServer();

    await data.tenants.create({
      id: "tenantId",
      friendly_name: "Test Tenant",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });

    // Create a client that the login session will reference
    await data.clients.create("tenantId", {
      client_id: "client123",
      client_secret: "secret123",
      name: "Test Client",
      callbacks: ["https://example.com/callback"],
      allowed_logout_urls: ["https://example.com/callback"],
      web_origins: ["https://example.com"],
      client_metadata: {},
    });

    // ----------------------------------------
    // Create
    // --------------------------------

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

    expect(createdLoginSession).toMatchObject({
      csrf_token: "csrf123",
      authParams: expect.objectContaining({
        client_id: "client123",
        response_type: AuthorizationResponseType.CODE,
        scope: "openid profile",
        state: "state123",
      }),
      ip: "127.0.0.1",
      useragent: "jest",
      state: LoginSessionState.PENDING,
      id: expect.any(String),
      created_at: expect.any(String),
      updated_at: expect.any(String),
      expires_at: expect.any(String),
    });

    // ----------------------------------------
    // Update
    // --------------------------------
    const updateLoginSessionResult = await data.loginSessions.update(
      "tenantId",
      createdLoginSession.id,
      {
        state: LoginSessionState.COMPLETED,
      },
    );
    expect(updateLoginSessionResult).toBe(true);

    // ----------------------------------------
    // Get
    // --------------------------------
    const getLoginSessionResult = await data.loginSessions.get(
      "tenantId",
      createdLoginSession.id,
    );
    expect(getLoginSessionResult).toMatchObject({
      csrf_token: "csrf123",
      authParams: expect.objectContaining({
        client_id: "client123",
        response_type: AuthorizationResponseType.CODE,
        scope: "openid profile",
        state: "state123",
      }),
      state: LoginSessionState.COMPLETED,
      id: createdLoginSession.id,
    });

    // ----------------------------------------
    // Delete
    // --------------------------------
    const deleteLoginSessionResult = await data.loginSessions.remove(
      "tenantId",
      createdLoginSession.id,
    );
    expect(deleteLoginSessionResult).toBe(true);

    // ----------------------------------------
    // Get with not found
    // --------------------------------
    const getLoginSessionResultNotFound = await data.loginSessions.get(
      "tenantId",
      createdLoginSession.id,
    );
    expect(getLoginSessionResultNotFound).toBe(null);
  });
});
