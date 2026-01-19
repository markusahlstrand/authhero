import { describe, it, expect, vi } from "vitest";
import {
  handleFormHook,
  isFormHook,
  resolveNode,
} from "../../src/hooks/formhooks";
import { Context } from "hono";
import { Bindings, Variables } from "../../src/types";
import {
  LoginSession,
  LoginSessionState,
  Node,
  User,
} from "@authhero/adapter-interfaces";

describe("formhooks", () => {
  describe("isFormHook", () => {
    it("should return true for valid form hooks", () => {
      expect(isFormHook({ form_id: "form1", enabled: true })).toBe(true);
      expect(isFormHook({ form_id: "form2", enabled: false })).toBe(true);
    });

    it("should return false for invalid hooks", () => {
      expect(isFormHook({ enabled: true })).toBe(false);
      expect(isFormHook({ form_id: 123, enabled: true })).toBe(false);
      expect(isFormHook({})).toBe(false);
    });
  });

  describe("resolveNode", () => {
    const mockUser: User = {
      user_id: "user1",
      email: "test@example.com",
      email_verified: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      connection: "email",
      is_social: false,
      login_count: 1,
      provider: "email",
    };

    it("should return step type for STEP nodes", async () => {
      const nodes = [
        { id: "step1", type: "STEP", coordinates: { x: 0, y: 0 } },
      ] as Node[];
      const result = await resolveNode(nodes, "step1", { user: mockUser });
      expect(result).toEqual({ type: "step", nodeId: "step1" });
    });

    it("should return end type for $ending", async () => {
      const result = await resolveNode([], "$ending", { user: mockUser });
      expect(result).toEqual({ type: "end" });
    });

    it("should return null for missing nodes", async () => {
      const result = await resolveNode([], "nonexistent", { user: mockUser });
      expect(result).toBeNull();
    });
  });

  describe("handleFormHook", () => {
    const mockTenantId = "test-tenant";
    const mockUser: User = {
      user_id: "user1",
      email: "test@example.com",
      email_verified: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      connection: "email",
      is_social: false,
      login_count: 1,
      provider: "email",
    };

    const mockLoginSession: LoginSession = {
      id: "session1",
      state: LoginSessionState.PENDING,
      csrf_token: "csrf-token",
      authParams: {
        client_id: "client1",
        redirect_uri: "https://example.com/callback",
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    };

    function createMockContext(formResponse: any) {
      return {
        var: {
          tenant_id: mockTenantId,
        },
        req: {
          header: vi.fn().mockReturnValue(mockTenantId),
        },
        env: {
          data: {
            forms: {
              get: vi.fn().mockResolvedValue(formResponse),
            },
            flows: {
              get: vi.fn().mockResolvedValue(null),
            },
            loginSessions: {
              get: vi.fn().mockResolvedValue({
                ...mockLoginSession,
                state: "pending",
              }),
              update: vi.fn().mockResolvedValue(undefined),
            },
          },
        },
      } as unknown as Context<{ Bindings: Bindings; Variables: Variables }>;
    }

    it("should return user when form resolves to end (no step to display)", async () => {
      // Create a form with a ROUTER that goes to $ending
      const form = {
        id: "form1",
        start: { next_node: "router1" },
        nodes: [
          {
            id: "router1",
            type: "ROUTER",
            config: {
              rules: [
                {
                  condition: { operator: "equals", field: "", value: "" },
                  next_node: "$ending",
                },
              ],
              fallback: "$ending",
            },
          },
        ],
      };

      const ctx = createMockContext(form);
      const result = await handleFormHook(
        ctx,
        "form1",
        mockLoginSession,
        mockUser,
      );

      // Should return user (not a Response redirect) when form resolves to end
      expect(result).toBe(mockUser);
    });

    it("should return user when form has no matching step node", async () => {
      // Create a form with nodes that don't lead to any STEP
      const form = {
        id: "form1",
        start: { next_node: "nonexistent" },
        nodes: [], // No nodes at all
      };

      const ctx = createMockContext(form);
      const result = await handleFormHook(
        ctx,
        "form1",
        mockLoginSession,
        mockUser,
      );

      // Should return user when resolution returns null
      expect(result).toBe(mockUser);
    });

    it("should return redirect Response when form has a STEP node to display", async () => {
      const form = {
        id: "form1",
        start: { next_node: "step1" },
        nodes: [{ id: "step1", type: "STEP" }],
      };

      const ctx = createMockContext(form);
      const result = await handleFormHook(
        ctx,
        "form1",
        mockLoginSession,
        mockUser,
      );

      // Should return a Response redirect to the form step
      expect(result).toBeInstanceOf(Response);
      const response = result as Response;
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain(
        `/u/forms/form1/nodes/step1`,
      );
    });

    it("should throw when form is not found", async () => {
      const ctx = createMockContext(null);

      await expect(
        handleFormHook(ctx, "nonexistent", mockLoginSession, mockUser),
      ).rejects.toThrow("Form not found");
    });
  });
});
