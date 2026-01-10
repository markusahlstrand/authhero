import { describe, it, expect, beforeEach, vi } from "vitest";
import { Context } from "hono";
import { handlePageHook, isPageHook } from "../../src/hooks/pagehooks";
import { Bindings, Variables } from "../../src/types";
import { LoginSession, User, LoginSessionState } from "@authhero/adapter-interfaces";

describe("pagehooks", () => {
  let mockCtx: Partial<Context<{ Bindings: Bindings; Variables: Variables }>>;
  let mockLoginSession: LoginSession;
  let mockUser: User;

  beforeEach(() => {
    mockCtx = {
      env: {
        data: {
          userPermissions: {
            list: vi.fn(),
          },
        },
      },
      var: {
        tenant_id: "test-tenant",
      },
      req: {
        header: vi.fn().mockReturnValue("test-tenant"),
      },
    } as any;

    mockLoginSession = {
      id: "login-session-id",
      created_at: "2023-01-01T00:00:00Z",
      updated_at: "2023-01-01T00:00:00Z",
      expires_at: "2023-01-01T01:00:00Z",
      csrf_token: "csrf-token",
      authParams: {
        client_id: "test-client",
      },
      state: LoginSessionState.PENDING,
    };

    mockUser = {
      user_id: "test|user123",
      email: "test@example.com",
      email_verified: true,
      created_at: "2023-01-01T00:00:00Z",
      updated_at: "2023-01-01T00:00:00Z",
      login_count: 1,
      provider: "auth2",
      connection: "Username-Password-Authentication",
      is_social: false,
    };
  });

  describe("isPageHook", () => {
    it("should return true for valid page hook", () => {
      const hook = {
        page_id: "impersonate",
        enabled: true,
        permission_required: "users:impersonate",
      };

      expect(isPageHook(hook)).toBe(true);
    });

    it("should return false for invalid page hook", () => {
      const hook = {
        form_id: "some-form",
        enabled: true,
      };

      expect(isPageHook(hook)).toBe(false);
    });

    it("should return false for hook without page_id", () => {
      const hook = {
        enabled: true,
        permission_required: "users:impersonate",
      };

      expect(isPageHook(hook)).toBe(false);
    });
  });

  describe("handlePageHook", () => {
    it("should redirect to page when user has required permission", async () => {
      const mockPermissions = [
        {
          permission_name: "users:impersonate",
          resource_server_identifier: "api",
          user_id: "test|user123",
          created_at: "2023-01-01T00:00:00Z",
          resource_server_name: "API",
        },
      ];

      mockCtx.env!.data.userPermissions.list = vi
        .fn()
        .mockResolvedValue(mockPermissions);

      const response = await handlePageHook(
        mockCtx as any,
        "impersonate",
        mockLoginSession,
        mockUser,
        "users:impersonate",
      );

      expect(response).toBeInstanceOf(Response);
      const actualResponse = response as Response;
      expect(actualResponse.status).toBe(302);
      expect(actualResponse.headers.get("location")).toBe(
        `/u/impersonate?state=${encodeURIComponent(mockLoginSession.id)}`,
      );
    });

    it("should return user when user lacks required permission", async () => {
      const mockPermissions = [
        {
          permission_name: "read:users",
          resource_server_identifier: "api",
          user_id: "test|user123",
          created_at: "2023-01-01T00:00:00Z",
          resource_server_name: "API",
        },
      ];

      mockCtx.env!.data.userPermissions.list = vi
        .fn()
        .mockResolvedValue(mockPermissions);

      const response = await handlePageHook(
        mockCtx as any,
        "impersonate",
        mockLoginSession,
        mockUser,
        "users:impersonate",
      );

      expect(response).toBe(mockUser);
    });

    it("should redirect to page when no permission is required", async () => {
      const response = await handlePageHook(
        mockCtx as any,
        "impersonate",
        mockLoginSession,
        mockUser,
      );

      expect(response).toBeInstanceOf(Response);
      const actualResponse = response as Response;
      expect(actualResponse.status).toBe(302);
      expect(actualResponse.headers.get("location")).toBe(
        `/u/impersonate?state=${encodeURIComponent(mockLoginSession.id)}`,
      );
    });

    it("should throw error when tenant_id is missing", async () => {
      const contextWithoutTenant = {
        ...mockCtx,
        var: {},
        req: {
          header: vi.fn().mockReturnValue(undefined),
        },
      };

      await expect(
        handlePageHook(
          contextWithoutTenant as any,
          "impersonate",
          mockLoginSession,
          mockUser,
          "users:impersonate",
        ),
      ).rejects.toThrow("Missing tenant_id in context");
    });
  });
});
