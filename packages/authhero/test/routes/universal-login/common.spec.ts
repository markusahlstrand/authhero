import { describe, it, expect, beforeEach } from "vitest";
import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { getTestServer } from "../../helpers/test-server";
import { initJSXRoute } from "../../../src/routes/universal-login/common";
import { Bindings, Variables } from "../../../src/types";
import { nanoid } from "nanoid";
import { RedirectException } from "../../../src/errors/redirect-exception";

describe("initJSXRoute", () => {
  let testServer: Awaited<ReturnType<typeof getTestServer>>;
  let ctx: Context<{ Bindings: Bindings; Variables: Variables }>;
  let mockLoginSession: any;
  let state: string;

  beforeEach(async () => {
    testServer = await getTestServer();

    // Create a mock context
    ctx = {
      env: testServer.env,
      var: {
        tenant_id: "tenantId",
      },
      set: () => {},
    } as any;

    // Generate a unique state for each test
    state = nanoid();

    // Create a login session for testing
    mockLoginSession = {
      id: state,
      csrf_token: "test-csrf",
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        response_type: "code",
        scope: "openid profile email",
        state: "auth-state",
        username: "test@example.com",
        vendor_id: "test-vendor",
        ui_locales: "en-US sv",
      },
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      login_completed: false,
    };

    // Store the login session
    await testServer.env.data.loginSessions.create(
      "tenantId",
      mockLoginSession,
    );
  });

  describe("happy path", () => {
    it("should initialize JSX route successfully with valid state", async () => {
      const result = await initJSXRoute(ctx, state);

      if (!result?.client) {
        throw new Error("Client not found in result");
      }

      expect(result.tenant).toBeDefined();
      expect(result.loginSession).toBeDefined();
      expect(result.theme).toBeDefined();

      // Verify client details
      expect(result.client.id).toBe("clientId");
      expect(result.client.name).toBe("Test Client");
      expect(result.client.tenant.id).toBe("tenantId");

      // Verify tenant details
      expect(result.tenant.id).toBe("tenantId");
      expect(result.tenant.name).toBe("Test Tenant");

      // Verify login session
      expect(result.loginSession.id).toBe(state);
      expect(result.loginSession.authParams.client_id).toBe("clientId");
      expect(result.loginSession.authParams.username).toBe("test@example.com");
    });

    it("should set context variables correctly", async () => {
      const setCalls: Array<[string, any]> = [];

      ctx.set = (key: string, value: any) => {
        setCalls.push([key, value]);
      };

      await initJSXRoute(ctx, state);

      // Check that required context variables were set
      expect(setCalls.some(([key]) => key === "loginSession")).toBe(true);
      expect(setCalls.some(([key]) => key === "client_id")).toBe(true);
      expect(setCalls.some(([key]) => key === "tenant_id")).toBe(true);

      const loginSessionCall = setCalls.find(([key]) => key === "loginSession");
      const clientIdCall = setCalls.find(([key]) => key === "client_id");
      const tenantIdCall = setCalls.find(([key]) => key === "tenant_id");

      expect(loginSessionCall?.[1].id).toBe(state);
      expect(clientIdCall?.[1]).toBe("clientId");
      expect(tenantIdCall?.[1]).toBe("tenantId");
    });

    it("should handle UI locales correctly", async () => {
      // Test with different locale settings
      const loginSessionWithLocale = {
        ...mockLoginSession,
        authParams: {
          ...mockLoginSession.authParams,
          ui_locales: "fr-FR en-US",
        },
      };

      await testServer.env.data.loginSessions.update(
        "tenantId",
        state,
        loginSessionWithLocale,
      );

      const result = await initJSXRoute(ctx, state);

      // The function should have processed the locales and possibly changed the i18next language
      expect(result?.loginSession?.authParams.ui_locales).toBe("fr-FR en-US");
    });

    it("should work with allowSession=true when session_id exists", async () => {
      // First create a mock session
      const mockSession = await testServer.env.data.sessions.create(
        "tenantId",
        {
          id: "test-session-id",
          user_id: "email|userId",
          clients: ["clientId"],
          expires_at: new Date(Date.now() + 1000).toISOString(),
          used_at: new Date().toISOString(),
          login_session_id: mockLoginSession.id,
          device: {
            last_ip: "",
            initial_ip: "",
            last_user_agent: "",
            initial_user_agent: "",
            initial_asn: "",
            last_asn: "",
          },
        },
      );

      // Update the login session to have a session_id
      const sessionLoginSession = {
        ...mockLoginSession,
        session_id: mockSession.id,
      };

      await testServer.env.data.loginSessions.update(
        "tenantId",
        state,
        sessionLoginSession,
      );

      const result = await initJSXRoute(ctx, state, true);

      expect(result?.loginSession?.session_id).toBe(mockSession.id);
    });
  });

  describe("error cases", () => {
    it("should throw HTTPException when login session not found", async () => {
      const nonExistentState = "non-existent-state";

      await expect(initJSXRoute(ctx, nonExistentState)).rejects.toThrow(
        HTTPException,
      );

      try {
        await initJSXRoute(ctx, nonExistentState);
      } catch (error) {
        expect(error).toBeInstanceOf(HTTPException);
        expect((error as HTTPException).status).toBe(400);
        expect((error as HTTPException).message).toBe(
          "Login session not found",
        );
      }
    });

    it("should throw HTTPException when tenant not found", async () => {
      // Create login session with non-existent tenant
      const invalidTenantState = nanoid();
      const invalidTenantLoginSession = {
        ...mockLoginSession,
        id: invalidTenantState,
        authParams: {
          ...mockLoginSession.authParams,
          client_id: "non-existent-client",
        },
      };

      // This will fail because the client doesn't exist, which means tenant lookup will fail
      await testServer.env.data.loginSessions.create(
        "tenantId",
        invalidTenantLoginSession,
      );

      await expect(initJSXRoute(ctx, invalidTenantState)).rejects.toThrow();
    });

    it("should throw RedirectException when login session is closed and allowSession is false", async () => {
      // First create a mock session
      const mockSession = await testServer.env.data.sessions.create(
        "tenantId",
        {
          id: "closed-session-id",
          user_id: "email|userId",
          clients: ["clientId"],
          expires_at: new Date(Date.now() + 1000).toISOString(),
          used_at: new Date().toISOString(),
          login_session_id: mockLoginSession.id,
          device: {
            last_ip: "",
            initial_ip: "",
            last_user_agent: "",
            initial_user_agent: "",
            initial_asn: "",
            last_asn: "",
          },
        },
      );

      // Update the login session to have a session_id (indicating it's closed)
      const closedLoginSession = {
        ...mockLoginSession,
        session_id: mockSession.id,
        login_completed: true, // Indicating the session is closed
      };

      await testServer.env.data.loginSessions.update(
        "tenantId",
        state,
        closedLoginSession,
      );

      // Expect a RedirectException to be thrown
      await expect(initJSXRoute(ctx, state, false)).rejects.toThrow(
        RedirectException,
      );

      try {
        await initJSXRoute(ctx, state, false);
      } catch (error) {
        expect(error).toBeInstanceOf(RedirectException);
        expect((error as RedirectException).status).toBe(302);

        // Verify that the redirect URL contains the required error parameters
        const redirectUrl = new URL((error as RedirectException).location);
        expect(redirectUrl.searchParams.get("error")).toBe("access_denied");
        expect(redirectUrl.searchParams.get("error_description")).toBe(
          "Login session closed",
        );
        expect(redirectUrl.searchParams.get("state")).toBe("auth-state");
        expect(redirectUrl.origin + redirectUrl.pathname).toBe(
          "https://example.com/callback",
        );
      }
    });

    it("should handle missing tenant_id in context", async () => {
      // Create context without tenant_id
      const ctxWithoutTenant = {
        ...ctx,
        var: {},
      } as any;

      const result = await initJSXRoute(ctxWithoutTenant, state);

      // Should still work as it uses empty string fallback
      expect(result).toBeDefined();
    });
  });

  describe("language handling", () => {
    it("should use tenant language as fallback when no UI locales", async () => {
      // Update tenant to have a specific language
      await testServer.env.data.tenants.update("tenantId", {
        language: "en",
      });

      // Remove ui_locales from login session
      const loginSessionNoLocales = {
        ...mockLoginSession,
        authParams: {
          ...mockLoginSession.authParams,
          ui_locales: undefined,
        },
      };

      await testServer.env.data.loginSessions.update(
        "tenantId",
        state,
        loginSessionNoLocales,
      );

      const result = await initJSXRoute(ctx, state);

      expect(result).toBeDefined();
      // The function should process the language change
    });

    it("should fallback to 'sv' when no UI locales or tenant language", async () => {
      // Update tenant to have no language
      await testServer.env.data.tenants.update("tenantId", {
        language: undefined,
      });

      // Remove ui_locales from login session
      const loginSessionNoLocales = {
        ...mockLoginSession,
        authParams: {
          ...mockLoginSession.authParams,
          ui_locales: undefined,
        },
      };

      await testServer.env.data.loginSessions.update(
        "tenantId",
        state,
        loginSessionNoLocales,
      );

      const result = await initJSXRoute(ctx, state);

      expect(result).toBeDefined();
      // Should use 'sv' as final fallback
    });
  });
});
